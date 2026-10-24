import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../common/phone.js';

export interface SmsMessage {
  to: string;
  body: string;
  sentAt: Date;
}

/**
 * SMS gönderim soyutlaması. Üretim için Netgsm / İleti Merkezi gibi bir
 * sağlayıcı bu sınıfı genişleten yeni bir sınıf olarak eklenir.
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
  async send(to: string, body: string): Promise<void> {
    this.outbox.push({ to, body, sentAt: new Date() });
  }
  lastTo(to: string): SmsMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}
