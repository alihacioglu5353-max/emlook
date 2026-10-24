import { eq } from 'drizzle-orm';
import { auditLogs, users } from '../src/db/schema.js';
import { MailService, type MemoryMailService } from '../src/mail/mail.service.js';
import { bearer, createTestApp, login, resetDb, type TestContext } from './helpers.js';

const EMAIL = 'ayse@ornek.com';
const PASS = 'Emlook2026';

describe('E-posta + parola ile giriş ve parola yenileme', () => {
  let ctx: TestContext;
  let mail: MemoryMailService;

  beforeAll(async () => {
    ctx = await createTestApp();
    mail = ctx.app.get(MailService) as MemoryMailService;
  });
  beforeEach(async () => {
    await resetDb(ctx);
    mail.outbox.length = 0;
  });
  afterAll(() => ctx.app.close());

  /** Telefonla kayıt olmuş, e-postası ve parolası olan kullanıcı */
  async function userWithPassword() {
    const s = await login(ctx, '05321110001');
    await ctx
      .http()
      .post('/api/v1/me/onboarding')
      .set(bearer(s.accessToken))
      .send({ fullName: 'Ayşe Yılmaz', accountType: 'consumer', kvkkClarification: true, termsOfUse: true, email: 'Ayse@Ornek.com' })
      .expect(201);
    await ctx.http().put('/api/v1/auth/password').set(bearer(s.accessToken)).send({ newPassword: PASS }).expect(200);
    return s;
  }
  const passwordLogin = (email: string, password: string) =>
    ctx.http().post('/api/v1/auth/password/login').send({ email, password });

  it('parola belirleme: e-posta ister, kurala uyar, mevcut parolayı doğrular', async () => {
    const s = await login(ctx, '05321110002');
    await ctx
      .http()
      .post('/api/v1/me/onboarding')
      .set(bearer(s.accessToken))
      .send({ fullName: 'Can Alıcı', accountType: 'consumer', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    const noEmail = await ctx.http().put('/api/v1/auth/password').set(bearer(s.accessToken)).send({ newPassword: PASS }).expect(400);
    expect(noEmail.body.code).toBe('EMAIL_REQUIRED');

    await ctx.http().patch('/api/v1/me').set(bearer(s.accessToken)).send({ email: 'can@ornek.com' }).expect(200);
    const weak = await ctx.http().put('/api/v1/auth/password').set(bearer(s.accessToken)).send({ newPassword: 'kisa' }).expect(400);
    expect(weak.body.code).toBe('PASSWORD_WEAK');
    const noDigit = await ctx.http().put('/api/v1/auth/password').set(bearer(s.accessToken)).send({ newPassword: 'sadeceharf' }).expect(400);
    expect(noDigit.body.message).toContain('rakam');

    let me = await ctx.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(200);
    expect(me.body.hasPassword).toBe(false);
    await ctx.http().put('/api/v1/auth/password').set(bearer(s.accessToken)).send({ newPassword: PASS }).expect(200);
    me = await ctx.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(200);
    expect(me.body.hasPassword).toBe(true);
    expect(me.body).not.toHaveProperty('passwordHash');

    // Değiştirirken mevcut parola zorunlu
    const wrong = await ctx
      .http()
      .put('/api/v1/auth/password')
      .set(bearer(s.accessToken))
      .send({ currentPassword: 'yanlis123', newPassword: 'YeniParola9' })
      .expect(400);
    expect(wrong.body.code).toBe('CURRENT_PASSWORD_INVALID');
    await ctx
      .http()
      .put('/api/v1/auth/password')
      .set(bearer(s.accessToken))
      .send({ currentPassword: PASS, newPassword: 'YeniParola9' })
      .expect(200);
    await passwordLogin('can@ornek.com', 'YeniParola9').expect(200);
    const [{ hash }] = await ctx.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, s.userId));
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('YeniParola9');
  });

  it('e-posta + parola ile giriş yapar; hatalı denemelerde aynı mesajı verir', async () => {
    const s = await userWithPassword();
    const ok = await passwordLogin('  AYSE@ornek.com ', PASS).expect(200);
    expect(ok.body).toMatchObject({ user: { id: s.userId }, onboardingRequired: false });
    expect(ok.body.accessToken).toBeTruthy();
    await ctx.http().get('/api/v1/me').set(bearer(ok.body.accessToken)).expect(200);

    const wrongPass = await passwordLogin(EMAIL, 'Yanlis12345').expect(401);
    const unknown = await passwordLogin('kimse@ornek.com', PASS).expect(401);
    expect(wrongPass.body.message).toBe(unknown.body.message);
    expect(wrongPass.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('5 hatalı denemeden sonra hesabı kilitler', async () => {
    await userWithPassword();
    for (let i = 0; i < 5; i++) await passwordLogin(EMAIL, 'Yanlis12345').expect(401);
    const locked = await passwordLogin(EMAIL, PASS).expect(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(800);
    const logs = await ctx.db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.action, 'auth.locked'));
    expect(logs).toHaveLength(1);
  });

  it('askıdaki hesap parola ile giremez', async () => {
    const s = await userWithPassword();
    await ctx.db.update(users).set({ status: 'suspended' }).where(eq(users.id, s.userId));
    await passwordLogin(EMAIL, PASS).expect(403);
  });

  it('parolamı unuttum: bağlantı e-postalanır, bir kez kullanılır, oturumları kapatır ve kilidi açar', async () => {
    const s = await userWithPassword();
    for (let i = 0; i < 5; i++) await passwordLogin(EMAIL, 'Yanlis12345').expect(401);

    // Kayıtlı olmayan adres de aynı yanıtı alır, e-posta gitmez
    await ctx.http().post('/api/v1/auth/password/forgot').send({ email: 'kimse@ornek.com' }).expect(200, { ok: true });
    expect(mail.outbox).toHaveLength(0);

    await ctx.http().post('/api/v1/auth/password/forgot').send({ email: 'Ayse@Ornek.com' }).expect(200, { ok: true });
    const msg = mail.lastTo(EMAIL)!;
    expect(msg.subject).toContain('parola');
    expect(msg.html).toContain('Yeni parola belirle');
    const token = msg.text.match(/parola-yenile\?token=([\w-]+)/)![1]!;

    const check = await ctx.http().get(`/api/v1/auth/password/reset?token=${token}`).expect(200);
    expect(check.body).toEqual({ valid: true, email: 'a**e@ornek.com' });
    await ctx.http().get('/api/v1/auth/password/reset?token=gecersiz-belirtec-000000').expect(200, { valid: false, email: null });

    const weak = await ctx.http().post('/api/v1/auth/password/reset').send({ token, password: '123' }).expect(400);
    expect(weak.body.code).toBe('PASSWORD_WEAK');
    await ctx.http().post('/api/v1/auth/password/reset').send({ token, password: 'Sifirlandi7' }).expect(200);
    const again = await ctx.http().post('/api/v1/auth/password/reset').send({ token, password: 'BaskaBir8' }).expect(400);
    expect(again.body.code).toBe('RESET_TOKEN_INVALID');

    // Eski oturum kapandı, kilit açıldı, yeni parola geçerli
    await ctx.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(401);
    await passwordLogin(EMAIL, PASS).expect(401);
    await passwordLogin(EMAIL, 'Sifirlandi7').expect(200);
  });

  it('saatte en fazla 3 sıfırlama e-postası gönderir', async () => {
    await userWithPassword();
    for (let i = 0; i < 5; i++) await ctx.http().post('/api/v1/auth/password/forgot').send({ email: EMAIL }).expect(200);
    expect(mail.outbox).toHaveLength(3);
  });
});
