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
      SMS_PROVIDER: 'netgsm',
      NETGSM_USERCODE: '8501234567',
      NETGSM_PASSWORD: 'parola',
      NETGSM_HEADER: 'EMLOOK',
    };
    expect(() => validateEnv(prod)).toThrow('en az 32');
    const strong = { ...prod, JWT_ACCESS_SECRET: long, OTP_SECRET: long };
    expect(() => validateEnv({ ...strong, SMS_PROVIDER: 'memory' })).toThrow('memory');
    expect(() => validateEnv({ ...strong, PAYMENT_WEBHOOK_SECRET: '' })).toThrow('PAYMENT_WEBHOOK_SECRET');
    expect(() => validateEnv({ ...strong, ALLOW_MOCK_PAYMENTS: undefined })).toThrow('PAYMENT_PROVIDER=mock');
    expect(() => validateEnv({ ...strong, SMS_PROVIDER: 'console' })).toThrow('gerçek SMS');
    expect(validateEnv({ ...strong, SMS_PROVIDER: 'console', ALLOW_CONSOLE_SMS: 'true' }).SMS_PROVIDER).toBe('console');
    expect(validateEnv(strong).PLATFORM_FEE_BPS).toBe(500);
  });

  it('Netgsm seçilince kimlik bilgilerini ister ve varsayılanları doldurur', () => {
    expect(() => validateEnv({ ...base, SMS_PROVIDER: 'netgsm' })).toThrow('NETGSM_USERCODE');
    const env = validateEnv({
      ...base,
      SMS_PROVIDER: 'netgsm',
      NETGSM_USERCODE: '8501234567',
      NETGSM_PASSWORD: 'p',
      NETGSM_HEADER: 'EMLOOK',
      NETGSM_USE_OTP: 'false',
    });
    expect(env.NETGSM).toEqual({
      userCode: '8501234567',
      password: 'p',
      header: 'EMLOOK',
      useOtpEndpoint: false,
      baseUrl: 'https://api.netgsm.com.tr',
    });
    expect(validateEnv(base).NETGSM).toBeNull();
  });

  it('S3 sürücüsü kimlik bilgilerini ister; R2 için bölge varsayılanı auto', () => {
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow('S3_BUCKET');
    const env = validateEnv({
      ...base,
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'emlook',
      S3_ENDPOINT: 'https://hesap.r2.cloudflarestorage.com',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
      S3_PREFIX: '/prod/',
    });
    expect(env.S3).toMatchObject({ bucket: 'emlook', region: 'auto', forcePathStyle: false, prefix: 'prod/' });
    expect(validateEnv(base).STORAGE_DRIVER).toBe('local');
  });

  it('FCM seçilince servis hesabını ister', () => {
    expect(() => validateEnv({ ...base, PUSH_PROVIDER: 'fcm' })).toThrow('FCM_SERVICE_ACCOUNT');
    expect(validateEnv({ ...base, PUSH_PROVIDER: 'fcm', FCM_SERVICE_ACCOUNT: '{}' }).FCM_SERVICE_ACCOUNT).toBe('{}');
    expect(validateEnv(base).FCM_SERVICE_ACCOUNT).toBeNull();
  });
});
