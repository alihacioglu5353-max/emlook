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
  /** console: koda loga yazar · memory: testler için bellekte tutar */
  SMS_PROVIDER: 'console' | 'memory';
  STORAGE_DIR: string;
  MAX_UPLOAD_MB: number;
  CORS_ORIGINS: string[];
  KVKK_CLARIFICATION_VERSION: string;
  TERMS_VERSION: string;
  ADMIN_PHONES: string[];
  /** mock: geliştirme/test · manual: yönetici elle doğrular (EİDS API entegrasyonuna kadar) */
  EIDS_PROVIDER: 'mock' | 'manual';
  MAX_LISTING_PHOTOS: number;
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
  if (!['console', 'memory'].includes(smsProvider)) {
    throw new Error(`Geçersiz SMS_PROVIDER: ${smsProvider}`);
  }

  const eids = optional(raw, 'EIDS_PROVIDER', nodeEnv === 'production' ? 'manual' : 'mock');
  if (!['mock', 'manual'].includes(eids)) {
    throw new Error(`Geçersiz EIDS_PROVIDER: ${eids}`);
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
  };

  if (env.NODE_ENV === 'production') {
    // Gerçek SMS sağlayıcısı (Netgsm, İleti Merkezi vb.) eklendiğinde
    // üretimde 'console' da yasaklanmalı.
    if (env.EIDS_PROVIDER === 'mock') {
      throw new Error('Üretimde EIDS_PROVIDER=mock kullanılamaz');
    }
    if (env.SMS_PROVIDER === 'memory') {
      throw new Error('Üretimde SMS_PROVIDER=memory kullanılamaz');
    }
    for (const key of ['JWT_ACCESS_SECRET', 'OTP_SECRET'] as const) {
      if (env[key].length < 32) {
        throw new Error(`${key} üretimde en az 32 karakter olmalı`);
      }
    }
  }
  return env;
}
