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

  it('üretimde kısa sırları ve bellek SMS sağlayıcısını reddeder', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    expect(() => validateEnv(prod)).toThrow('en az 32');
    const long = 'a'.repeat(40);
    expect(() =>
      validateEnv({
        ...prod,
        JWT_ACCESS_SECRET: long,
        OTP_SECRET: long,
        SMS_PROVIDER: 'memory',
      }),
    ).toThrow('memory');
  });
});
