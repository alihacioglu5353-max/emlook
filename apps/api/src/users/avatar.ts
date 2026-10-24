import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { eq } from 'drizzle-orm';
import { sniff } from '../agents/agents.service.js';
import { type AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { users } from '../db/schema.js';
import { StorageService } from '../storage/storage.service.js';

/** Hazır avatarlar: web ve mobil aynı kimliklerle çizer (p01–p12) */
export const AVATAR_PRESETS = Array.from({ length: 12 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export type Avatar = { kind: 'photo'; url: string } | { kind: 'preset'; preset: string } | null;

/** İstemciye dönen avatar bilgisi */
export function avatarOf(u: { id: string; avatarKey: string | null; avatarPreset: string | null; avatarUpdatedAt?: Date | null }): Avatar {
  if (u.avatarKey) return { kind: 'photo', url: `/users/${u.id}/avatar?v=${u.avatarUpdatedAt?.getTime() ?? 0}` };
  if (u.avatarPreset) return { kind: 'preset', preset: u.avatarPreset };
  return null;
}

class AvatarPresetDto {
  @ApiProperty({ enum: AVATAR_PRESETS })
  @IsIn(AVATAR_PRESETS, { message: 'Geçersiz avatar' })
  preset!: string;
}

@Injectable()
export class AvatarService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  private async current(userId: string) {
    const [u] = await this.db
      .select({ id: users.id, avatarKey: users.avatarKey, avatarPreset: users.avatarPreset, avatarUpdatedAt: users.avatarUpdatedAt })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) throw new NotFoundException('Kullanıcı bulunamadı');
    return u;
  }

  async upload(userId: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Bir resim seçin' });
    const kind = sniff(file.buffer);
    if (!kind || kind.mime === 'application/pdf') {
      throw new BadRequestException({ code: 'FILE_TYPE', message: 'Profil resmi JPG, PNG, BMP veya WEBP olmalı' });
    }
    const old = await this.current(userId);
    const key = await this.storage.put(`avatars/${userId}`, file.buffer, kind.ext, kind.mime);
    const now = new Date();
    await this.db.update(users).set({ avatarKey: key, avatarPreset: null, avatarUpdatedAt: now }).where(eq(users.id, userId));
    if (old.avatarKey) await this.storage.remove(old.avatarKey);
    return { avatar: avatarOf({ id: userId, avatarKey: key, avatarPreset: null, avatarUpdatedAt: now }) };
  }

  async preset(userId: string, preset: string) {
    const old = await this.current(userId);
    const now = new Date();
    await this.db.update(users).set({ avatarKey: null, avatarPreset: preset, avatarUpdatedAt: now }).where(eq(users.id, userId));
    if (old.avatarKey) await this.storage.remove(old.avatarKey);
    return { avatar: avatarOf({ id: userId, avatarKey: null, avatarPreset: preset }) };
  }

  async clear(userId: string) {
    const old = await this.current(userId);
    await this.db.update(users).set({ avatarKey: null, avatarPreset: null, avatarUpdatedAt: new Date() }).where(eq(users.id, userId));
    if (old.avatarKey) await this.storage.remove(old.avatarKey);
    return { avatar: null };
  }

  async stream(userId: string) {
    const u = await this.current(userId);
    if (!u.avatarKey) throw new NotFoundException('Profil resmi yok');
    const ext = u.avatarKey.split('.').pop();
    const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return new StreamableFile(await this.storage.stream(u.avatarKey), { type });
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller()
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Profil resmi yükler (JPG, PNG, BMP, WEBP; en fazla 5 MB)' })
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.avatars.upload(user.id, file);
  }

  @Put('me/avatar')
  @ApiOperation({ summary: 'Hazır avatar seçer (p01–p12)' })
  preset(@CurrentUser() user: AuthUser, @Body() dto: AvatarPresetDto) {
    return this.avatars.preset(user.id, dto.preset);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Profil resmini kaldırır' })
  clear(@CurrentUser() user: AuthUser) {
    return this.avatars.clear(user.id);
  }

  @Get('users/:id/avatar')
  @ApiOperation({ summary: 'Kullanıcının profil resmi' })
  stream(@Param('id', ParseUUIDPipe) id: string) {
    return this.avatars.stream(id);
  }
}
