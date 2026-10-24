import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface CheckoutInput {
  requestId: string;
  publicToken: string;
  amount: number;
  currency: string;
  description: string;
  payer: { name: string; email: string | null; phone: string | null };
  /** Pazaryeri bölüşümü: alt üye işyeri başına tutar */
  splits: { subMerchantRef: string | null; amount: number }[];
  returnUrl: string;
}

export interface CheckoutSession {
  sessionId: string;
  redirectUrl: string;
}

export interface ProviderEvent {
  id: string;
  type: 'payment.succeeded' | 'payment.failed';
  sessionId: string;
  paymentId: string | null;
  raw: Record<string, unknown>;
}

export interface SubMerchantInput {
  userId: string;
  holderName: string;
  iban: string;
  taxId: string;
}

/**
 * Ödeme sağlayıcısı soyutlaması (pazaryeri / split ödeme). Trinkle360 lisans ve
 * split kabiliyeti netleşince bu sınıfı genişleten sağlayıcı eklenecek.
 */
export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** İmzayı doğrular; geçersizse null */
  abstract parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent | null;
  abstract registerSubMerchant(input: SubMerchantInput): Promise<{ ref: string; status: 'verified' | 'pending' }>;
}

export const SIGNATURE_HEADER = 'x-emlook-signature';

export const sign = (secret: string, body: Buffer | string) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

/**
 * Test/geliştirme sağlayıcısı: ödeme web uygulamasındaki deneme ekranında
 * tamamlanır; bildirim, gerçek sağlayıcı gibi imzalı webhook olarak işlenir.
 */
export class MockPaymentProvider extends PaymentProvider {
  readonly name = 'mock';

  constructor(
    private readonly secret: string,
    private readonly webUrl: string,
  ) {
    super();
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const sessionId = `mock_${randomBytes(12).toString('hex')}`;
    return {
      sessionId,
      redirectUrl: `${this.webUrl}/odeme/${input.publicToken}?oturum=${sessionId}`,
    };
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent | null {
    const got = headers[SIGNATURE_HEADER];
    if (typeof got !== 'string') return null;
    const want = sign(this.secret, rawBody);
    const a = Buffer.from(got);
    const b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    if (typeof body.id !== 'string' || typeof body.sessionId !== 'string') return null;
    if (body.type !== 'payment.succeeded' && body.type !== 'payment.failed') return null;
    return {
      id: body.id,
      type: body.type,
      sessionId: body.sessionId,
      paymentId: typeof body.paymentId === 'string' ? body.paymentId : null,
      raw: body,
    };
  }

  /** Deneme ekranı için imzalı olay gövdesi üretir */
  buildEvent(sessionId: string, outcome: 'success' | 'fail') {
    const body = JSON.stringify({
      id: `evt_${randomBytes(10).toString('hex')}`,
      type: outcome === 'success' ? 'payment.succeeded' : 'payment.failed',
      sessionId,
      paymentId: outcome === 'success' ? `pay_${randomBytes(8).toString('hex')}` : null,
    });
    return { body: Buffer.from(body), signature: sign(this.secret, body) };
  }

  async registerSubMerchant(input: SubMerchantInput) {
    return { ref: `MOCK-SM-${input.userId.slice(0, 8)}`, status: 'verified' as const };
  }
}
