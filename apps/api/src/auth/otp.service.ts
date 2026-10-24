import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { otpCodes } from '../db/schema.js';
import { SmsService } from '../sms/sms.service.js';

export interface OtpRequestResult {
  expiresInSeconds: number;
  resendInSeconds: number;
}

/**
 * Tek kullanımlık giriş kodları. Kodun kendisi saklanmaz; telefonla
 * birlikte HMAC-SHA256 özeti tutulur. Deneme sayısı, süre ve gönderim
 * sıklığı sınırlıdır.
 */
@Injectable()
export class OtpService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly sms: SmsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get ttl() {
    return this.config.get('OTP_TTL_SECONDS', { infer: true });
  }
  private get resend() {
    return this.config.get('OTP_RESEND_SECONDS', { infer: true });
  }

  async request(phone: string): Promise<OtpRequestResult> {
    const now = Date.now();

    const [last] = await this.db
      .select({ createdAt: otpCodes.createdAt })
      .from(otpCodes)
      .where(eq(otpCodes.phone, phone))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (last) {
      const waited = (now - last.createdAt.getTime()) / 1000;
      if (waited < this.resend) {
        throw tooMany(
          'Yeni kod istemeden önce biraz bekleyin',
          Math.ceil(this.resend - waited),
        );
      }
    }

    const [{ value: lastHour }] = await this.db
      .select({ value: count() })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          gt(otpCodes.createdAt, new Date(now - 3600_000)),
        ),
      );
    if (lastHour >= this.config.get('OTP_HOURLY_LIMIT', { infer: true })) {
      throw tooMany('Çok fazla kod istendi, bir saat sonra tekrar deneyin', 3600);
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

    // Önceki kullanılmamış kodlar geçersiz olur; yalnızca en son kod geçerlidir.
    await this.db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)));

    await this.db.insert(otpCodes).values({
      phone,
      codeHash: this.hash(phone, code),
      expiresAt: new Date(now + this.ttl * 1000),
    });

    try {
      await this.sms.send(phone, `Emlook giris kodunuz: ${code}. Kodu kimseyle paylasmayin.`);
    } catch {
      // Kod iletilemedi: geçersiz say ki yeniden istemek bekleme süresine takılmasın
      await this.db.delete(otpCodes).where(and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt)));
      throw new ServiceUnavailableException({
        code: 'SMS_FAILED',
        message: 'Doğrulama kodu şu an gönderilemedi, lütfen biraz sonra tekrar deneyin',
      });
    }

    return { expiresInSeconds: this.ttl, resendInSeconds: this.resend };
  }

  /** Kod doğruysa tüketir; değilse hata fırlatır. */
  async verify(phone: string, code: string): Promise<void> {
    const invalid = new BadRequestException({
      code: 'OTP_INVALID',
      message: 'Kod hatalı veya süresi dolmuş',
    });
    const max = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });

    const [current] = await this.db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (!current) throw invalid;

    // Deneme sayısını atomik olarak artır; sınır aşıldıysa güncelleme olmaz.
    const [bumped] = await this.db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(and(eq(otpCodes.id, current.id), lt(otpCodes.attempts, max)))
      .returning({ attempts: otpCodes.attempts });
    if (!bumped) {
      throw new BadRequestException({
        code: 'OTP_LOCKED',
        message: 'Çok fazla hatalı deneme, yeni kod isteyin',
      });
    }

    if (!this.matches(current.codeHash, this.hash(phone, code))) throw invalid;

    const [consumed] = await this.db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpCodes.id, current.id), isNull(otpCodes.consumedAt)))
      .returning({ id: otpCodes.id });
    if (!consumed) throw invalid; // aynı kod eşzamanlı iki kez kullanılamaz
  }

  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.config.get('OTP_SECRET', { infer: true }))
      .update(`${phone}:${code}`)
      .digest('hex');
  }

  private matches(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}

function tooMany(message: string, retryAfterSeconds: number) {
  return new HttpException(
    { code: 'OTP_RATE_LIMITED', message, retryAfterSeconds },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
