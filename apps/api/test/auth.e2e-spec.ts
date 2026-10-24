import { eq } from 'drizzle-orm';
import { otpCodes, users } from '../src/db/schema.js';
import {
  bearer,
  createTestApp,
  lastCode,
  login,
  resetDb,
  type TestContext,
} from './helpers.js';

describe('Kimlik doğrulama (OTP ve oturum)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  it('geçersiz telefonu reddeder', async () => {
    const res = await ctx
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '0212 123 45 67' })
      .expect(400);
    expect(res.body.code).toBe('PHONE_INVALID');
  });

  it('farklı yazımları aynı numaraya çevirir ve yeni kullanıcı açar', async () => {
    await ctx
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+90 (532) 111-22-33' })
      .expect(200)
      .expect((r) => expect(r.body.expiresInSeconds).toBe(180));

    const code = lastCode(ctx, '+905321112233');
    const res = await ctx
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '05321112233', code })
      .expect(200);

    expect(res.body.onboardingRequired).toBe(true);
    expect(res.body.user.phone).toBe('+905321112233');
    expect(res.body.user.role).toBeNull();
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    // Kod veritabanında düz metin olarak tutulmaz
    const [row] = await ctx.db.select().from(otpCodes).limit(1);
    expect(row.codeHash).not.toContain(code);
  });

  it('SMS iletilemezse 503 döner ve hemen yeniden kod istenebilir', async () => {
    ctx.sms.failNext = true;
    const res = await ctx
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '05321112233' })
      .expect(503);
    expect(res.body.code).toBe('SMS_FAILED');
    await ctx.http().post('/api/v1/auth/otp/request').send({ phone: '05321112233' }).expect(200);
    expect(ctx.sms.outbox).toHaveLength(1);
  });

  it('kodu ikinci kez kabul etmez', async () => {
    await ctx.http().post('/api/v1/auth/otp/request').send({ phone: '05321112233' });
    const code = lastCode(ctx, '+905321112233');
    await ctx
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '05321112233', code })
      .expect(200);
    const again = await ctx
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '05321112233', code })
      .expect(400);
    expect(again.body.code).toBe('OTP_INVALID');
  });

  it('5 hatalı denemeden sonra kodu kilitler', async () => {
    await ctx.http().post('/api/v1/auth/otp/request').send({ phone: '05321112233' });
    const code = lastCode(ctx, '+905321112233');
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      await ctx
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '05321112233', code: wrong })
        .expect(400);
    }
    const locked = await ctx
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '05321112233', code })
      .expect(400);
    expect(locked.body.code).toBe('OTP_LOCKED');
  });

  it('bekleme süresi dolmadan yeni kod göndermez', async () => {
    await ctx
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '05321112233' })
      .expect(200);
    const res = await ctx
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '05321112233' })
      .expect(429);
    expect(res.body.code).toBe('OTP_RATE_LIMITED');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(ctx.sms.outbox).toHaveLength(1);
  });

  it('yeni kod istenince eski kod geçersiz olur', async () => {
    await ctx.http().post('/api/v1/auth/otp/request').send({ phone: '05321112233' });
    const first = lastCode(ctx, '+905321112233');
    // Bekleme süresini geçmiş gibi göster
    await ctx.db
      .update(otpCodes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(otpCodes.phone, '+905321112233'));
    await ctx
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '05321112233' })
      .expect(200);
    const second = lastCode(ctx, '+905321112233');

    if (first !== second) {
      await ctx
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '05321112233', code: first })
        .expect(400);
    }
    await ctx
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '05321112233', code: second })
      .expect(200);
  });

  it('korumalı uç noktalar belirteç ister', async () => {
    await ctx.http().get('/api/v1/me').expect(401);
    await ctx.http().get('/api/v1/me').set(bearer('bozuk')).expect(401);
  });

  it('yenileme belirteci döner; eski belirteç tekrar kullanılamaz', async () => {
    const session = await login(ctx, '05321112233');
    const res = await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    expect(res.body.refreshToken).not.toBe(session.refreshToken);

    await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    await ctx.http().get('/api/v1/me').set(bearer(res.body.accessToken)).expect(200);
  });

  it('çıkış oturumu hemen sonlandırır', async () => {
    const session = await login(ctx, '05321112233');
    await ctx.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(200);
    await ctx
      .http()
      .post('/api/v1/auth/logout')
      .set(bearer(session.accessToken))
      .expect(204);
    await ctx.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(401);
    await ctx
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
  });

  it('askıya alınan kullanıcı erişemez', async () => {
    const session = await login(ctx, '05321112233');
    await ctx.db
      .update(users)
      .set({ status: 'suspended' })
      .where(eq(users.id, session.userId));
    await ctx.http().get('/api/v1/me').set(bearer(session.accessToken)).expect(403);
  });

  it('sağlık kontrolü veritabanını doğrular', async () => {
    await ctx
      .http()
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up' });
  });
});
