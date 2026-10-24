import { Logger } from '@nestjs/common';
import { maskPhone } from '../common/phone.js';
import { SmsDeliveryError, SmsService } from './sms.service.js';

export interface NetgsmConfig {
  userCode: string;
  password: string;
  /** Netgsm'de onaylı gönderici başlığı (örn. EMLOOK) */
  header: string;
  /** true: /otp (OTP paketi, öncelikli hat) · false: /send */
  useOtpEndpoint: boolean;
  baseUrl: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Netgsm REST v2 yanıt kodları → açıklama (00 başarılı) */
const CODES: Record<string, string> = {
  '20': 'Mesaj metni hatalı veya çok uzun',
  '30': 'Netgsm kimlik bilgisi geçersiz, API yetkisi veya IP kısıtı',
  '40': 'Gönderici başlığı (msgheader) hesapta tanımlı değil',
  '41': 'Gönderici başlığı (msgheader) hesapta tanımlı değil',
  '50': 'İYS kontrollü gönderim yapılamıyor',
  '51': 'İYS kontrollü gönderim yapılamıyor',
  '60': 'OTP paketi tanımlı değil',
  '70': 'Hatalı veya eksik parametre',
  '80': 'Gönderim sınırı aşıldı',
  '85': 'Aynı numaraya kısa sürede çok fazla gönderim',
  '100': 'Netgsm sistem hatası',
};

/** Yeniden denemeye değer kodlar */
const RETRYABLE = new Set(['100']);

/**
 * Netgsm REST v2 ile SMS gönderimi.
 * Belge: https://www.netgsm.com.tr/dokuman/ (POST, Basic auth, JSON)
 */
export class NetgsmSmsService extends SmsService {
  private readonly logger = new Logger('SMS:netgsm');
  private readonly auth: string;

  constructor(
    private readonly config: NetgsmConfig,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
    private readonly timeoutMs = 10_000,
  ) {
    super();
    this.auth = 'Basic ' + Buffer.from(`${config.userCode}:${config.password}`).toString('base64');
  }

  async send(to: string, body: string): Promise<void> {
    const no = toNetgsmNumber(to);
    const path = this.config.useOtpEndpoint ? '/sms/rest/v2/otp' : '/sms/rest/v2/send';
    const payload = {
      msgheader: this.config.header,
      // OTP hattı Türkçe karakter desteklemez; metinlerimiz ASCII. Normal
      // gönderimde Türkçe karakter varsa TR kodlaması istenir.
      encoding: /[^\x00-\x7F]/.test(body) && !this.config.useOtpEndpoint ? 'TR' : 'ASCII',
      messages: [{ msg: body, no }],
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const jobId = await this.post(path, payload);
        this.logger.log(`→ ${maskPhone(to)} gönderildi (iş ${jobId})`);
        return;
      } catch (e) {
        lastError = e;
        const retryable = !(e instanceof SmsDeliveryError) || e.retryable;
        if (!retryable || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    this.logger.error(`→ ${maskPhone(to)} gönderilemedi: ${String(lastError)}`);
    throw lastError instanceof SmsDeliveryError
      ? lastError
      : new SmsDeliveryError(`Netgsm'e ulaşılamadı: ${String(lastError)}`, true);
  }

  private async post(path: string, payload: unknown): Promise<string> {
    const res = await this.fetchImpl(this.config.baseUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.auth },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    // Netgsm sonuç kodunu 200 ve 406 yanıtlarının gövdesinde verir
    if (res.status !== 200 && res.status !== 406) {
      throw new SmsDeliveryError(`Netgsm HTTP ${res.status}`, res.status >= 500);
    }
    const data = (await res.json().catch(() => ({}))) as { code?: string | number; jobid?: string | number; description?: string };
    const code = String(data.code ?? '');
    if (code !== '00') {
      throw new SmsDeliveryError(
        `Netgsm ${code || '?'}: ${CODES[code] ?? data.description ?? 'bilinmeyen hata'}`,
        RETRYABLE.has(code),
        code,
      );
    }
    return String(data.jobid ?? '');
  }
}

/** +905321234567 → 5321234567 (Netgsm ulusal 10 hane bekler) */
export function toNetgsmNumber(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return digits.startsWith('90') && digits.length === 12 ? digits.slice(2) : digits.replace(/^0/, '');
}
