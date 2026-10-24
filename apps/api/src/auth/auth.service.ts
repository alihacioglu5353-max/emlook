import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { ClientInfo } from '../common/auth.decorators.js';
import type { AccessPayload } from '../common/auth.guards.js';
import { normalizeTrPhone } from '../common/phone.js';
import type { Env } from '../config/env.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { sessions, users, type User } from '../db/schema.js';
import { OtpService } from './otp.service.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

export interface LoginResult extends TokenPair {
  user: { id: string; phone: string; role: User['role'] };
  /** Rol seçilmemişse istemci kayıt (onboarding) ekranını açar. */
  onboardingRequired: boolean;
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  parsePhone(input: string): string {
    const phone = normalizeTrPhone(input);
    if (!phone) {
      throw new BadRequestException({
        code: 'PHONE_INVALID',
        message: 'Geçerli bir cep telefonu numarası girin',
      });
    }
    return phone;
  }

  async requestOtp(phoneInput: string) {
    return this.otp.request(this.parsePhone(phoneInput));
  }

  /**
   * Kod doğrulanınca kullanıcı yoksa oluşturulur (giriş ve kayıt aynı akış),
   * yeni bir oturum açılır.
   */
  async verifyOtp(
    phoneInput: string,
    code: string,
    client: ClientInfo,
  ): Promise<LoginResult> {
    const phone = this.parsePhone(phoneInput);
    await this.otp.verify(phone, code);

    await this.db.insert(users).values({ phone }).onConflictDoNothing();
    const [user] = await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.phone, phone))
      .returning();

    if (user.status === 'suspended') {
      throw new ForbiddenException('Hesabınız askıya alınmış');
    }

    const tokens = await this.openSession(user.id, client);
    return {
      ...tokens,
      user: { id: user.id, phone: user.phone, role: user.role },
      onboardingRequired: user.role === null,
    };
  }

  /**
   * Yenileme belirteci her kullanımda değişir (rotation); eski belirteç
   * bir daha kullanılamaz.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<TokenPair> {
    const [session] = await this.db
      .select({ id: sessions.id, userId: sessions.userId, status: users.status })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.refreshTokenHash, sha256(refreshToken)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!session) throw new UnauthorizedException('Oturum geçersiz');
    if (session.status === 'suspended') {
      throw new ForbiddenException('Hesabınız askıya alınmış');
    }

    const next = this.newRefreshToken();
    await this.db
      .update(sessions)
      .set({
        refreshTokenHash: sha256(next),
        lastUsedAt: new Date(),
        ip: client.ip,
        userAgent: client.userAgent,
      })
      .where(eq(sessions.id, session.id));

    return {
      accessToken: await this.signAccess(session.userId, session.id),
      refreshToken: next,
      accessTokenExpiresIn: this.accessTtl,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  private async openSession(
    userId: string,
    client: ClientInfo,
  ): Promise<TokenPair> {
    const refreshToken = this.newRefreshToken();
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        refreshTokenHash: sha256(refreshToken),
        ip: client.ip,
        userAgent: client.userAgent,
        expiresAt: new Date(Date.now() + days * 86_400_000),
      })
      .returning({ id: sessions.id });

    return {
      accessToken: await this.signAccess(userId, session.id),
      refreshToken,
      accessTokenExpiresIn: this.accessTtl,
    };
  }

  private get accessTtl() {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  private signAccess(userId: string, sessionId: string) {
    const payload: AccessPayload = { sub: userId, sid: sessionId };
    return this.jwt.signAsync(payload, { expiresIn: this.accessTtl });
  }

  private newRefreshToken() {
    return randomBytes(32).toString('base64url');
  }
}
