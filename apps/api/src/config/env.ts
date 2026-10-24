/**
 * Ortam değişkenlerini tek yerde doğrular. Eksik veya hatalı bir değer
 * uygulamanın açılışta net bir hatayla durmasını sağlar.
 */
export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  REFRESH_TTL_DAYS: number;
  OTP_SECRET: string;
  OTP_TTL_SECONDS: number;
  OTP_MAX_ATTEMPTS: number;
  OTP_RESEND_SECONDS: number;
  OTP_HOURLY_LIMIT: number;
  /** console: kodu loga yazar · memory: testler · netgsm: gerçek SMS */
  SMS_PROVIDER: 'console' | 'memory' | 'netgsm';
  /** Netgsm (SMS_PROVIDER=netgsm iken zorunlu) */
  NETGSM: { userCode: string; password: string; header: string; useOtpEndpoint: boolean; baseUrl: string } | null;
  STORAGE_DIR: string;
  MAX_UPLOAD_MB: number;
  CORS_ORIGINS: string[];
  KVKK_CLARIFICATION_VERSION: string;
  TERMS_VERSION: string;
  ADMIN_PHONES: string[];
  /** mock: geliştirme/test · manual: yönetici elle doğrular (EİDS API entegrasyonuna kadar) */
  EIDS_PROVIDER: 'mock' | 'manual';
  MAX_LISTING_PHOTOS: number;
  PUSH_PROVIDER: 'log' | 'memory';
  PAYMENT_PROVIDER: 'mock';
  PAYMENT_WEBHOOK_SECRET: string;
  /** Platform hizmet bedeli, on binde (500 = %5) */
  PLATFORM_FEE_BPS: number;
  VAT_RATE_BPS: number;
  PAYMENT_LINK_DAYS: number;
  /** Ödeme bağlantılarının açılacağı web adresi */
  PUBLIC_WEB_URL: string;
}

const required = (raw: Record<string, unknown>, key: string): string => {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Ortam değişkeni eksik: ${key}`);
  }
  return value.trim();
};

const optional = (
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
): string => {
  const value = raw[key];
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : fallback;
};

const int = (
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
): number => {
  const value = Number(optional(raw, key, String(fallback)));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Ortam değişkeni pozitif tam sayı olmalı: ${key}`);
  }
  return value;
};

const list = (raw: Record<string, unknown>, key: string): string[] =>
  optional(raw, key, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function validateEnv(raw: Record<string, unknown>): Env {
  const nodeEnv = optional(raw, 'NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`Geçersiz NODE_ENV: ${nodeEnv}`);
  }
  const smsProvider = optional(raw, 'SMS_PROVIDER', 'console');
  if (!['console', 'memory', 'netgsm'].includes(smsProvider)) {
    throw new Error(`Geçersiz SMS_PROVIDER: ${smsProvider}`);
  }

  const eids = optional(raw, 'EIDS_PROVIDER', nodeEnv === 'production' ? 'manual' : 'mock');
  if (!['mock', 'manual'].includes(eids)) {
    throw new Error(`Geçersiz EIDS_PROVIDER: ${eids}`);
  }

  const push = optional(raw, 'PUSH_PROVIDER', 'log');
  if (!['log', 'memory'].includes(push)) {
    throw new Error(`Geçersiz PUSH_PROVIDER: ${push}`);
  }

  const paymentProvider = optional(raw, 'PAYMENT_PROVIDER', 'mock');
  if (!['mock'].includes(paymentProvider)) {
    throw new Error(`Geçersiz PAYMENT_PROVIDER: ${paymentProvider}`);
  }

  const env: Env = {
    NODE_ENV: nodeEnv as Env['NODE_ENV'],
    PORT: int(raw, 'PORT', 3000),
    DATABASE_URL: required(raw, 'DATABASE_URL'),
    JWT_ACCESS_SECRET: required(raw, 'JWT_ACCESS_SECRET'),
    JWT_ACCESS_TTL_SECONDS: int(raw, 'JWT_ACCESS_TTL_SECONDS', 900),
    REFRESH_TTL_DAYS: int(raw, 'REFRESH_TTL_DAYS', 30),
    OTP_SECRET: required(raw, 'OTP_SECRET'),
    OTP_TTL_SECONDS: int(raw, 'OTP_TTL_SECONDS', 180),
    OTP_MAX_ATTEMPTS: int(raw, 'OTP_MAX_ATTEMPTS', 5),
    OTP_RESEND_SECONDS: int(raw, 'OTP_RESEND_SECONDS', 60),
    OTP_HOURLY_LIMIT: int(raw, 'OTP_HOURLY_LIMIT', 5),
    SMS_PROVIDER: smsProvider as Env['SMS_PROVIDER'],
    NETGSM:
      smsProvider === 'netgsm'
        ? {
            userCode: required(raw, 'NETGSM_USERCODE'),
            password: required(raw, 'NETGSM_PASSWORD'),
            header: required(raw, 'NETGSM_HEADER'),
            // OTP paketi (hızlı, öncelikli hat) varsayılan; kapatılırsa normal gönderim
            useOtpEndpoint: optional(raw, 'NETGSM_USE_OTP', 'true') !== 'false',
            baseUrl: optional(raw, 'NETGSM_BASE_URL', 'https://api.netgsm.com.tr').replace(/\/$/, ''),
          }
        : null,
    STORAGE_DIR: optional(raw, 'STORAGE_DIR', './uploads'),
    MAX_UPLOAD_MB: int(raw, 'MAX_UPLOAD_MB', 10),
    CORS_ORIGINS: list(raw, 'CORS_ORIGINS'),
    KVKK_CLARIFICATION_VERSION: optional(
      raw,
      'KVKK_CLARIFICATION_VERSION',
      '2026-11',
    ),
    TERMS_VERSION: optional(raw, 'TERMS_VERSION', '2026-11'),
    ADMIN_PHONES: list(raw, 'ADMIN_PHONES'),
    EIDS_PROVIDER: eids as Env['EIDS_PROVIDER'],
    MAX_LISTING_PHOTOS: int(raw, 'MAX_LISTING_PHOTOS', 20),
    PUSH_PROVIDER: push as Env['PUSH_PROVIDER'],
    PAYMENT_PROVIDER: paymentProvider as Env['PAYMENT_PROVIDER'],
    PAYMENT_WEBHOOK_SECRET:
      nodeEnv === 'production'
        ? required(raw, 'PAYMENT_WEBHOOK_SECRET')
        : optional(raw, 'PAYMENT_WEBHOOK_SECRET', 'dev-payment-webhook-secret'),
    PLATFORM_FEE_BPS: int(raw, 'PLATFORM_FEE_BPS', 500),
    VAT_RATE_BPS: int(raw, 'VAT_RATE_BPS', 2000),
    PAYMENT_LINK_DAYS: int(raw, 'PAYMENT_LINK_DAYS', 7),
    PUBLIC_WEB_URL: optional(raw, 'PUBLIC_WEB_URL', 'http://localhost:3001').replace(/\/$/, ''),
  };

  if (env.NODE_ENV === 'production') {
    if (env.EIDS_PROVIDER === 'mock') {
      throw new Error('Üretimde EIDS_PROVIDER=mock kullanılamaz');
    }
    if (env.SMS_PROVIDER === 'memory') {
      throw new Error('Üretimde SMS_PROVIDER=memory kullanılamaz');
    }
    if (env.SMS_PROVIDER === 'console' && raw.ALLOW_CONSOLE_SMS !== 'true') {
      // Kodlar loga yazılırsa giriş güvenliği olmaz
      throw new Error('Üretimde gerçek SMS sağlayıcısı gerekli (SMS_PROVIDER=netgsm)');
    }
    if (env.PAYMENT_PROVIDER === 'mock' && raw.ALLOW_MOCK_PAYMENTS !== 'true') {
      // Gerçek sağlayıcı (Trinkle360) eklenene kadar üretimde ödeme alınmaz
      throw new Error('Üretimde PAYMENT_PROVIDER=mock kullanılamaz (ALLOW_MOCK_PAYMENTS=true ile demo)');
    }
    for (const key of ['JWT_ACCESS_SECRET', 'OTP_SECRET', 'PAYMENT_WEBHOOK_SECRET'] as const) {
      if (env[key].length < 32) {
        throw new Error(`${key} üretimde en az 32 karakter olmalı`);
      }
    }
  }
  return env;
}
