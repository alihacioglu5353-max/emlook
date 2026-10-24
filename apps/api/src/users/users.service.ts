import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { ClientInfo } from '../common/auth.decorators.js';
import { AuditService } from '../common/audit.service.js';
import type { Env } from '../config/env.js';
import { InjectDb, type Database } from '../db/db.module.js';
import {
  agentProfiles,
  consents,
  users,
  type ConsentType,
} from '../db/schema.js';
import type { OnboardingDto, UpdateMeDto } from './dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async me(userId: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        createdAt: users.createdAt,
        verificationStatus: agentProfiles.verificationStatus,
      })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new NotFoundException('Kullanıcı bulunamadı');

    const { verificationStatus, ...user } = row;
    return {
      ...user,
      onboardingRequired: user.role === null,
      agent:
        user.role === 'agent'
          ? {
              verificationStatus,
              isVerified: verificationStatus === 'approved',
            }
          : null,
      consents: await this.currentConsents(userId),
    };
  }

  /**
   * Hesap tipini bir kez belirler ve zorunlu rızaları kaydeder.
   * Danışman seçilirse taslak bir danışman profili açılır.
   */
  async onboard(userId: string, dto: OnboardingDto, client: ClientInfo) {
    await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!user) throw new NotFoundException('Kullanıcı bulunamadı');
      if (user.role !== null) {
        throw new ConflictException({
          code: 'ALREADY_ONBOARDED',
          message: 'Hesap kurulumu zaten tamamlanmış',
        });
      }

      if (dto.email) await this.assertEmailFree(tx, dto.email, userId);

      await tx
        .update(users)
        .set({
          fullName: dto.fullName.trim(),
          email: dto.email?.toLowerCase() ?? null,
          role: dto.accountType,
        })
        .where(eq(users.id, userId));

      if (dto.accountType === 'agent') {
        await tx.insert(agentProfiles).values({ userId });
      }

      const kvkk = this.config.get('KVKK_CLARIFICATION_VERSION', {
        infer: true,
      });
      const terms = this.config.get('TERMS_VERSION', { infer: true });
      const rows: { type: ConsentType; version: string; granted: boolean }[] = [
        { type: 'kvkk_clarification', version: kvkk, granted: true },
        { type: 'terms_of_use', version: terms, granted: true },
        { type: 'marketing', version: kvkk, granted: dto.marketing ?? false },
      ];
      await tx.insert(consents).values(
        rows.map((r) => ({
          ...r,
          userId,
          ip: client.ip,
          userAgent: client.userAgent,
        })),
      );
    });

    await this.audit.log({
      actorId: userId,
      action: 'user.onboarded',
      targetType: 'user',
      targetId: userId,
      metadata: { accountType: dto.accountType },
    });
    return this.me(userId);
  }

  async update(userId: string, dto: UpdateMeDto) {
    if (dto.email) await this.assertEmailFree(this.db, dto.email, userId);
    const patch: Partial<typeof users.$inferInsert> = {};
    if (dto.fullName !== undefined) patch.fullName = dto.fullName.trim();
    if (dto.email !== undefined) patch.email = dto.email.toLowerCase();
    if (Object.keys(patch).length > 0) {
      await this.db.update(users).set(patch).where(eq(users.id, userId));
    }
    return this.me(userId);
  }

  async setMarketingConsent(
    userId: string,
    granted: boolean,
    client: ClientInfo,
  ) {
    await this.db.insert(consents).values({
      userId,
      type: 'marketing',
      version: this.config.get('KVKK_CLARIFICATION_VERSION', { infer: true }),
      granted,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    await this.audit.log({
      actorId: userId,
      action: 'consent.updated',
      targetType: 'user',
      targetId: userId,
      metadata: { type: 'marketing', granted },
    });
    return this.me(userId);
  }

  /** Her rıza türü için en son kayıt geçerlidir. */
  private async currentConsents(userId: string) {
    const rows = await this.db
      .selectDistinctOn([consents.type], {
        type: consents.type,
        version: consents.version,
        granted: consents.granted,
        at: consents.createdAt,
      })
      .from(consents)
      .where(eq(consents.userId, userId))
      .orderBy(consents.type, desc(consents.createdAt));
    return rows;
  }

  private async assertEmailFree(
    db: Pick<Database, 'select'>,
    email: string,
    userId: string,
  ) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email.toLowerCase()), ne(users.id, userId)))
      .limit(1);
    if (taken) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'Bu e-posta başka bir hesapta kullanılıyor',
      });
    }
  }
}
