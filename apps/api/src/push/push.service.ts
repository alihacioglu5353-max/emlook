import { Injectable, Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { InjectDb, type Database } from '../db/db.module.js';
import { devices, type DevicePlatform } from '../db/schema.js';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  /** Sağlayıcının geçersiz saydığı belirteçler (silinir) */
  invalidTokens: string[];
}

/**
 * Push gönderim soyutlaması. Üretimde FCM (Android + iOS/APNs köprüsü)
 * bu sınıfı genişleten bir sağlayıcı olarak eklenecek.
 */
export abstract class PushProvider {
  abstract send(tokens: string[], payload: PushPayload): Promise<PushResult>;
}

/** Geliştirme: loga yazar */
export class LogPushProvider extends PushProvider {
  private readonly logger = new Logger('Push');
  async send(tokens: string[], p: PushPayload): Promise<PushResult> {
    this.logger.log(`→ ${tokens.length} cihaz: ${p.title} — ${p.body}`);
    return { invalidTokens: [] };
  }
}

/** Testler: gönderimleri bellekte tutar; "invalid-" ile başlayan belirteçler geçersiz sayılır */
export class MemoryPushProvider extends PushProvider {
  readonly sent: { tokens: string[]; payload: PushPayload }[] = [];
  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    this.sent.push({ tokens, payload });
    return { invalidTokens: tokens.filter((t) => t.startsWith('invalid-')) };
  }
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly provider: PushProvider,
  ) {}

  async register(userId: string, token: string, platform: DevicePlatform) {
    // Aynı cihaz başka hesapla giriş yaptıysa belirteç yeni kullanıcıya geçer
    await this.db
      .insert(devices)
      .values({ userId, token, platform })
      .onConflictDoUpdate({
        target: devices.token,
        set: { userId, platform, lastSeenAt: new Date() },
      });
  }

  async unregister(userId: string, token: string) {
    await this.db.delete(devices).where(eq(devices.token, token));
    void userId;
  }

  private readonly pending = new Set<Promise<void>>();

  /**
   * Arka planda gönderir; isteği bekletmez. İşlem (transaction) içinden çağrıldığında
   * kayıt işlendikten sonra çalışsın diye bir sonraki döngüye bırakılır.
   */
  dispatch(userIds: string[], payload: PushPayload) {
    const p = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.toUsers(userIds, payload))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /** Testler: bekleyen gönderimlerin bitmesini bekler */
  async flush() {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  /**
   * Kullanıcıların cihazlarına gönderir. Hata isteği bozmaz: push en iyi çaba ile yapılır.
   */
  async toUsers(userIds: string[], payload: PushPayload) {
    if (userIds.length === 0) return;
    try {
      const rows = await this.db
        .select({ token: devices.token })
        .from(devices)
        .where(inArray(devices.userId, [...new Set(userIds)]));
      if (rows.length === 0) return;
      const { invalidTokens } = await this.provider.send(rows.map((r) => r.token), payload);
      if (invalidTokens.length > 0) {
        await this.db.delete(devices).where(inArray(devices.token, invalidTokens));
      }
    } catch (e) {
      this.logger.warn(`Push gönderilemedi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
