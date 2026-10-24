import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../common/audit.service.js';
import { type AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators.js';
import { normalizeTrPhone } from '../common/phone.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { documentTypes, verificationDocuments } from '../db/schema.js';
import { brandedMail, SmtpMailService } from '../mail/mail.service.js';
import { FcmPushProvider, parseServiceAccount } from '../push/fcm.js';
import { NetgsmSmsService } from '../sms/netgsm.js';
import { S3StorageService } from '../storage/storage.service.js';
import { BadgesService } from './badges.service.js';
import { LogsService, type LogQuery } from './logs.service.js';
import {
  BADGE_METRIC_LABELS,
  BADGE_METRICS,
  GENERAL_FIELDS,
  INTEGRATIONS,
  type BadgeSettings,
  type IntegrationName,
} from './settings.defs.js';
import { SettingsService } from './settings.service.js';

class DocumentTypeDto {
  @ApiProperty({ example: 'tax_plate' })
  @IsString()
  @Matches(/^[a-z0-9_]{2,40}$/, { message: 'Anahtar küçük harf, rakam ve alt çizgi olmalı' })
  key!: string;

  @ApiProperty({ example: 'Vergi levhası' })
  @IsString()
  @Length(2, 80)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty()
  @IsBoolean()
  required!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

class TestIntegrationDto {
  @ApiPropertyOptional({ description: 'SMS için telefon, e-posta için adres' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  to?: string;
}

class LogsQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() @MaxLength(60) action?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsIn(['today', '7d', '30d', 'all']) range?: LogQuery['range'];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsIn(['online', 'today']) scope?: 'online' | 'today';
}

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly badges: BadgesService,
    private readonly logs: LogsService,
    private readonly audit: AuditService,
    @InjectDb() private readonly db: Database,
  ) {}

  // ---- Herkese açık bilgiler (duyuru, rozet tanımları) ----

  @Public()
  @Get('settings/public')
  @ApiOperation({ summary: 'Duyuru bandı, destek iletişimi ve rozet tanımları' })
  async publicInfo() {
    const g = await this.settings.general();
    return {
      announcement: g.announcement || null,
      supportEmail: g.supportEmail || null,
      supportPhone: g.supportPhone || null,
      badgeTiers: (await this.settings.badges()).tiers,
    };
  }

  // ---- Yönetici ayarları ----

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/settings')
  @ApiOperation({ summary: 'Tüm ayarlar (gizli değerler maskeli)' })
  async all() {
    return {
      general: await this.settings.general(),
      generalFields: GENERAL_FIELDS,
      badges: await this.settings.badges(),
      badgeMetrics: BADGE_METRICS.map((key) => ({ key, label: BADGE_METRIC_LABELS[key] })),
      badgeDistribution: await this.badges.distribution(),
      integrations: await this.settings.integrationsView(),
    };
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('admin/settings/general')
  async setGeneral(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const out = await this.settings.setGeneral(body, user.id);
    await this.audit.log({ actorId: user.id, action: 'settings.updated', targetType: 'settings', targetId: 'general', metadata: { keys: Object.keys(body) } });
    return out;
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('admin/settings/badges')
  @ApiOperation({ summary: 'Rozet ölçütleri ve eşikleri; kaydedince puanlar yeniden hesaplanır' })
  async setBadges(@CurrentUser() user: AuthUser, @Body() body: BadgeSettings) {
    const badges = await this.settings.setBadges(body, user.id);
    const distribution = await this.badges.recompute();
    await this.audit.log({ actorId: user.id, action: 'settings.updated', targetType: 'settings', targetId: 'badges' });
    return { badges, distribution };
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('admin/settings/badges/recompute')
  async recompute(@CurrentUser() user: AuthUser) {
    const distribution = await this.badges.recompute();
    await this.audit.log({ actorId: user.id, action: 'badges.recomputed', targetType: 'settings', targetId: 'badges' });
    return { distribution };
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Put('admin/settings/integrations/:name')
  @ApiOperation({ summary: 'Entegrasyon ayarı; boş gizli alan mevcut değeri korur, null siler' })
  async setIntegration(@CurrentUser() user: AuthUser, @Param('name') name: string, @Body() body: Record<string, unknown>) {
    const n = this.integrationName(name);
    const out = await this.settings.setIntegration(n, body, user.id);
    await this.audit.log({ actorId: user.id, action: 'settings.updated', targetType: 'settings', targetId: `integration.${n}`, metadata: { keys: Object.keys(body) } });
    return out;
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('admin/settings/integrations/:name/test')
  @ApiOperation({ summary: 'Kayıtlı ayarla bağlantıyı dener (Netgsm: SMS, SMTP: e-posta, S3: yaz/sil, FCM: kimlik)' })
  async test(@Param('name') name: string, @Body() dto: TestIntegrationDto) {
    const n = this.integrationName(name);
    const s = await this.settings.integration(n);
    if (!s) throw new BadRequestException('Önce ayarları kaydedin');
    try {
      switch (n) {
        case 'netgsm': {
          const phone = normalizeTrPhone(dto.to ?? '');
          if (!phone) throw new BadRequestException('Test için geçerli bir cep telefonu girin');
          await new NetgsmSmsService({
            userCode: String(s.userCode),
            password: String(s.password),
            header: String(s.header),
            useOtpEndpoint: s.useOtpEndpoint !== false,
            baseUrl: String(s.baseUrl || 'https://api.netgsm.com.tr').replace(/\/$/, ''),
          }).send(phone, 'Emlook test mesajı: Netgsm ayarlarınız çalışıyor.');
          return { ok: true, message: `Test SMS'i gönderildi: ${phone}` };
        }
        case 'smtp': {
          if (!dto.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dto.to)) throw new BadRequestException('Test için geçerli bir e-posta girin');
          await new SmtpMailService(
            { host: String(s.host), port: Number(s.port) || 587, secure: s.secure === true, user: (s.user as string) || undefined, pass: (s.pass as string) || undefined },
            (s.from as string) || 'Emlook <no-reply@emlook.app>',
          ).send({
            to: dto.to,
            subject: 'Emlook SMTP testi',
            text: 'SMTP ayarlarınız çalışıyor.',
            html: brandedMail({ title: 'SMTP testi başarılı', intro: 'Emlook e-posta ayarlarınız çalışıyor.' }),
          });
          return { ok: true, message: `Test e-postası gönderildi: ${dto.to}` };
        }
        case 's3': {
          const store = new S3StorageService({
            bucket: String(s.bucket),
            region: String(s.region || 'auto'),
            endpoint: (s.endpoint as string) || undefined,
            accessKeyId: String(s.accessKeyId),
            secretAccessKey: String(s.secretAccessKey),
            forcePathStyle: s.forcePathStyle === true,
            prefix: String(s.prefix || ''),
          });
          const key = await store.put('healthcheck', Buffer.from(`emlook ${randomBytes(4).toString('hex')}`), 'txt', 'text/plain');
          await store.remove(key);
          return { ok: true, message: 'Kovaya yazma ve silme başarılı' };
        }
        case 'fcm': {
          await new FcmPushProvider(parseServiceAccount(String(s.serviceAccount))).checkCredentials();
          return { ok: true, message: 'Firebase servis hesabıyla erişim belirteci alındı' };
        }
        default:
          return { ok: false, message: 'Bu entegrasyon için bağlantı testi, entegrasyon kodu tamamlanınca eklenecek' };
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      return { ok: false, message: `Bağlantı başarısız: ${(e as Error).message}` };
    }
  }

  // ---- Evrak türleri ----

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/document-types')
  async documentTypes() {
    const { rows } = await this.db.execute(sql`
      select t.*, t.sort_order as "sortOrder", t.created_at as "createdAt",
        (select count(*)::int from verification_documents d where d.type = t.key) as uploads
      from document_types t order by t.sort_order, t.label`);
    return rows;
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('admin/document-types')
  async createDocumentType(@CurrentUser() user: AuthUser, @Body() dto: DocumentTypeDto) {
    const [row] = await this.db
      .insert(documentTypes)
      .values({ key: dto.key, label: dto.label.trim(), description: dto.description?.trim() || null, required: dto.required, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 50 })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException('Bu anahtarla bir evrak türü zaten var');
    await this.audit.log({ actorId: user.id, action: 'document_type.updated', targetType: 'document_type', targetId: dto.key, metadata: { created: true } });
    return row;
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Patch('admin/document-types/:id')
  async updateDocumentType(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DocumentTypeDto) {
    const [row] = await this.db
      .update(documentTypes)
      .set({ label: dto.label.trim(), description: dto.description?.trim() || null, required: dto.required, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 50 })
      .where(eq(documentTypes.id, id))
      .returning();
    if (!row) throw new BadRequestException('Evrak türü bulunamadı');
    await this.audit.log({ actorId: user.id, action: 'document_type.updated', targetType: 'document_type', targetId: row.key });
    return row;
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Delete('admin/document-types/:id')
  @ApiOperation({ summary: 'Yüklenmiş belgesi olmayan türü siler; olanı pasife alın' })
  async deleteDocumentType(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const [t] = await this.db.select().from(documentTypes).where(eq(documentTypes.id, id));
    if (!t) throw new BadRequestException('Evrak türü bulunamadı');
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(verificationDocuments).where(eq(verificationDocuments.type, t.key));
    if (n > 0) throw new ConflictException(`Bu türde ${n} yüklenmiş belge var; silmek yerine pasife alın`);
    await this.db.delete(documentTypes).where(eq(documentTypes.id, id));
    await this.audit.log({ actorId: user.id, action: 'document_type.updated', targetType: 'document_type', targetId: t.key, metadata: { deleted: true } });
    return this.db.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder));
  }

  // ---- Log izleme ----

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/logs/overview')
  overview() {
    return this.logs.overview();
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/logs/online')
  online(@Query() q: LogsQueryDto) {
    return this.logs.online(q.scope ?? 'online', q.limit ?? 100, q.offset ?? 0);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/logs/sessions')
  sessions(@Query() q: LogsQueryDto) {
    return this.logs.sessions(q.limit ?? 100, q.offset ?? 0);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Delete('admin/logs/sessions/:id')
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.logs.revokeSession(user.id, id);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/logs/events')
  events(@Query() q: LogsQueryDto) {
    return this.logs.events(q);
  }

  private integrationName(name: string): IntegrationName {
    if (!(INTEGRATIONS as readonly string[]).includes(name)) throw new BadRequestException('Bilinmeyen entegrasyon');
    return name as IntegrationName;
  }
}
