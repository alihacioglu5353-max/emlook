import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../common/phone.js';

export interface SmsMessage {
  to: string;
  body: string;
  sentAt: Date;
}

/** Sağlayıcı SMS'i kabul etmedi veya ulaşılamadı. */
export class SmsDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SmsDeliveryError';
  }
}

/**
 * SMS gönderim soyutlaması: `console` (geliştirme), `memory` (test),
 * `netgsm` (üretim, bkz. netgsm.ts). Başarısız gönderim SmsDeliveryError fırlatır.
 */
export abstract class SmsService {
  abstract send(to: string, body: string): Promise<void>;
}

/** Geliştirme ortamı: mesajı loga yazar. */
@Injectable()
export class ConsoleSmsService extends SmsService {
  private readonly logger = new Logger('SMS');
  async send(to: string, body: string): Promise<void> {
    this.logger.log(`→ ${maskPhone(to)}: ${body}`);
  }
}

/** Testler: mesajları bellekte tutar, testten okunabilir. */
@Injectable()
export class MemorySmsService extends SmsService {
  readonly outbox: SmsMessage[] = [];
  /** Testte sağlayıcı hatasını taklit etmek için: sıradaki gönderim başarısız olur */
  failNext = false;
  async send(to: string, body: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new SmsDeliveryError('Test: sağlayıcı hatası', true);
    }
    this.outbox.push({ to, body, sentAt: new Date() });
  }
  lastTo(to: string): SmsMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}
