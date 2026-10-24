import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://localhost/emlook',
  JWT_ACCESS_SECRET: 'x',
  OTP_SECRET: 'y',
};

describe('validateEnv', () => {
  it('varsayılanları doldurur', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.OTP_TTL_SECONDS).toBe(180);
    expect(env.SMS_PROVIDER).toBe('console');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('zorunlu değişken eksikse durur', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: '' })).toThrow(
      'DATABASE_URL',
    );
  });

  it('listeleri virgülden ayırır', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('üretimde kısa sırları, test sağlayıcılarını ve eksik webhook sırrını reddeder', () => {
    const long = 'a'.repeat(40);
    const prod = {
      ...base,
      NODE_ENV: 'production',
      PAYMENT_WEBHOOK_SECRET: long,
      EIDS_PROVIDER: 'manual',
      ALLOW_MOCK_PAYMENTS: 'true',
    };
    expect(() => validateEnv(prod)).toThrow('en az 32');
    const strong = { ...prod, JWT_ACCESS_SECRET: long, OTP_SECRET: long };
    expect(() => validateEnv({ ...strong, SMS_PROVIDER: 'memory' })).toThrow('memory');
    expect(() => validateEnv({ ...strong, PAYMENT_WEBHOOK_SECRET: '' })).toThrow('PAYMENT_WEBHOOK_SECRET');
    expect(() => validateEnv({ ...strong, ALLOW_MOCK_PAYMENTS: undefined })).toThrow('PAYMENT_PROVIDER=mock');
    expect(validateEnv(strong).PLATFORM_FEE_BPS).toBe(500);
  });
});
