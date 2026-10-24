import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../common/audit.service.js';
import type { ClientInfo } from '../common/auth.decorators.js';
import { hashPassword, passwordProblem, verifyPassword } from '../common/password.js';
import type { Env } from '../config/env.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { passwordResetTokens, sessions, users } from '../db/schema.js';
import { brandedMail, MailService } from '../mail/mail.service.js';
import { AuthService, type LoginResult } from './auth.service.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
/** Art arda bu kadar hatalı denemede hesap LOCK_MINUTES dakika kilitlenir */
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
/** Kullanıcı başına saatte en fazla bu kadar sıfırlama e-postası */
const RESET_PER_HOUR = 3;

const invalid = () =>
  new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-posta veya parola hatalı' });

@Injectable()
export class PasswordService {
  private readonly logger = new Logger('Password');

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  assertStrong(password: string) {
    const problem = passwordProblem(password);
    if (problem) throw new BadRequestException({ code: 'PASSWORD_WEAK', message: problem });
  }

  /** E-posta + parola ile giriş. Hata mesajı e-postanın kayıtlı olup olmadığını belli etmez. */
  async login(emailInput: string, password: string, client: ClientInfo): Promise<LoginResult> {
    const email = emailInput.trim().toLowerCase();
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const retry = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: `Çok fazla hatalı deneme. ${Math.ceil(retry / 60)} dakika sonra tekrar dene ya da parolanı sıfırla.`,
          retryAfterSeconds: retry,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok) {
      if (user) {
        const failed = user.failedLogins + 1;
        const lock = failed >= MAX_FAILED;
        await this.db
          .update(users)
          .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
          .where(eq(users.id, user.id));
        if (lock) {
          await this.audit.log({ actorId: user.id, action: 'auth.locked', targetType: 'user', targetId: user.id, ip: client.ip, userAgent: client.userAgent });
        }
      }
      await this.audit.log({
        actorId: user?.id ?? null,
        action: 'auth.login_failed',
        targetType: 'user',
        targetId: user?.id,
        metadata: { method: 'password', email: maskEmail(email) },
        ip: client.ip,
        userAgent: client.userAgent,
      });
      throw invalid();
    }
    if (user.status === 'suspended') throw new ForbiddenException('Hesabınız askıya alınmış');

    await this.db
      .update(users)
      .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    const tokens = await this.auth.issueSession(user.id, client);
    await this.audit.log({ actorId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, metadata: { method: 'password' }, ip: client.ip, userAgent: client.userAgent });
    return {
      ...tokens,
      user: { id: user.id, phone: user.phone, role: user.role },
      onboardingRequired: user.role === null,
    };
  }

  /** Sıfırlama bağlantısı gönderir. Her durumda aynı yanıt döner (hesap varlığı sızmaz). */
  async forgot(emailInput: string, client: ClientInfo) {
    const email = emailInput.trim().toLowerCase();
    const [user] = await this.db
      .select({ id: users.id, fullName: users.fullName, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const done = { ok: true };
    if (!user || user.status === 'suspended') return done;

    const [{ n }] = await this.db
      .select({ n: count() })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, new Date(Date.now() - 3_600_000))));
    if (n >= RESET_PER_HOUR) return done;

    const token = randomBytes(32).toString('base64url');
    const ttl = this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
    await this.db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttl * 60_000),
      ip: client.ip,
    });
    const url = `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/parola-yenile?token=${token}`;
    const hello = user.fullName ? `Merhaba ${user.fullName.split(' ')[0]},` : 'Merhaba,';
    try {
      await this.mail.send({
        to: email,
        subject: 'Emlook parola yenileme',
        text: `${hello}\n\nParolanı yenilemek için ${ttl} dakika içinde şu bağlantıyı aç:\n${url}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; parolan değişmez.`,
        html: brandedMail({
          title: 'Parolanı yenile',
          intro: `${hello} Emlook hesabın için parola yenileme isteği aldık. Bağlantı ${ttl} dakika geçerli ve yalnızca bir kez kullanılabilir.`,
          cta: { label: 'Yeni parola belirle', url },
          outro: 'Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; parolan değişmez.',
        }),
      });
    } catch (e) {
      // Kullanıcıya yine aynı yanıt; hata sunucu loguna düşer
      this.logger.error(`Sıfırlama e-postası gönderilemedi: ${(e as Error).message}`);
    }
    await this.audit.log({ actorId: user.id, action: 'password.reset_requested', targetType: 'user', targetId: user.id, ip: client.ip, userAgent: client.userAgent });
    return done;
  }

  /** Bağlantı hâlâ geçerli mi (sayfa açılırken gösterilecek bilgi) */
  async checkToken(token: string) {
    const row = await this.validToken(token);
    return { valid: !!row, email: row?.email ? maskEmail(row.email) : null };
  }

  async reset(token: string, password: string) {
    this.assertStrong(password);
    const row = await this.validToken(token);
    if (!row) {
      throw new BadRequestException({ code: 'RESET_TOKEN_INVALID', message: 'Bağlantının süresi dolmuş veya daha önce kullanılmış. Yeni bir bağlantı iste.' });
    }
    const hash = await hashPassword(password);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      // Aynı anda iki kez kullanılmasın: yalnızca kullanılmamış satırı işaretle
      const used = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
        .returning({ id: passwordResetTokens.id });
      if (used.length === 0) throw new BadRequestException({ code: 'RESET_TOKEN_INVALID', message: 'Bağlantı daha önce kullanılmış.' });
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));
      await tx
        .update(users)
        .set({ passwordHash: hash, passwordUpdatedAt: now, failedLogins: 0, lockedUntil: null })
        .where(eq(users.id, row.userId));
      // Parola sıfırlanınca tüm açık oturumlar kapanır
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
    });
    await this.audit.log({ actorId: row.userId, action: 'password.reset', targetType: 'user', targetId: row.userId });
    return { ok: true };
  }

  /** Oturum açıkken parola belirleme / değiştirme; diğer oturumlar kapanır */
  async change(userId: string, sessionId: string, newPassword: string, currentPassword?: string) {
    this.assertStrong(newPassword);
    const [user] = await this.db
      .select({ email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId));
    if (!user?.email) {
      throw new BadRequestException({ code: 'EMAIL_REQUIRED', message: 'E-posta ile giriş için önce e-posta adresini ekle.' });
    }
    if (user.passwordHash && !(await verifyPassword(currentPassword ?? '', user.passwordHash))) {
      throw new BadRequestException({ code: 'CURRENT_PASSWORD_INVALID', message: 'Mevcut parola hatalı' });
    }
    const now = new Date();
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), passwordUpdatedAt: now, failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, userId));
    await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId), isNull(sessions.revokedAt)));
    await this.audit.log({
      actorId: userId,
      action: user.passwordHash ? 'password.changed' : 'password.set',
      targetType: 'user',
      targetId: userId,
    });
    return { ok: true, passwordUpdatedAt: now };
  }

  private async validToken(token: string) {
    if (!token || token.length > 200) return null;
    const [row] = await this.db
      .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId, email: users.email })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(
        and(
          eq(passwordResetTokens.tokenHash, sha256(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, sql`now()`),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}

/** a***e@ornek.com */
export function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  return `${name[0]}${'*'.repeat(Math.max(1, Math.min(5, name.length - 2)))}${name.length > 1 ? name.at(-1) : ''}@${domain}`;
}
