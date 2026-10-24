import { auditLogs, consents } from '../src/db/schema.js';
import {
  bearer,
  createTestApp,
  login,
  loginAsAdmin,
  PDF,
  resetDb,
  type LoggedIn,
  type TestContext,
} from './helpers.js';

const ONBOARD_AGENT = {
  fullName: 'Ayşe Yılmaz',
  accountType: 'agent',
  email: 'ayse@ornek.com',
  kvkkClarification: true,
  termsOfUse: true,
  marketing: false,
};

describe('E1 — kayıt, danışman başvurusu ve admin onayı', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const onboard = (s: LoggedIn, body: object) =>
    ctx.http().post('/api/v1/me/onboarding').set(bearer(s.accessToken)).send(body);

  describe('onboarding', () => {
    it('zorunlu rızalar olmadan kayıt tamamlanmaz', async () => {
      const s = await login(ctx, '05321112233');
      const res = await onboard(s, { ...ONBOARD_AGENT, kvkkClarification: false });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain('KVKK');
    });

    it('mülk sahibi olarak kayıt olur ve danışman uç noktalarına erişemez', async () => {
      const s = await login(ctx, '05321112233');
      const res = await onboard(s, {
        fullName: 'Mehmet Demir',
        accountType: 'consumer',
        kvkkClarification: true,
        termsOfUse: true,
      }).expect(201);
      expect(res.body.role).toBe('consumer');
      expect(res.body.agent).toBeNull();
      expect(res.body.onboardingRequired).toBe(false);

      await ctx
        .http()
        .get('/api/v1/agents/me/verification')
        .set(bearer(s.accessToken))
        .expect(403);
    });

    it('rızaları sürümüyle kaydeder ve hesap tipi bir kez seçilir', async () => {
      const s = await login(ctx, '05321112233');
      const res = await onboard(s, ONBOARD_AGENT).expect(201);
      expect(res.body.role).toBe('agent');
      expect(res.body.agent).toEqual({
        verificationStatus: 'draft',
        isVerified: false,
      });
      const types = res.body.consents.map((c: { type: string }) => c.type).sort();
      expect(types).toEqual(['kvkk_clarification', 'marketing', 'terms_of_use']);

      const again = await onboard(s, ONBOARD_AGENT).expect(409);
      expect(again.body.code).toBe('ALREADY_ONBOARDED');

      const rows = await ctx.db.select().from(consents);
      expect(rows.every((r) => r.version === '2026-11')).toBe(true);
    });

    it('aynı e-posta iki hesapta kullanılamaz', async () => {
      const a = await login(ctx, '05321112233');
      await onboard(a, ONBOARD_AGENT).expect(201);
      const b = await login(ctx, '05324445566');
      const res = await onboard(b, ONBOARD_AGENT).expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('ticari ileti izni sonradan geri alınabilir', async () => {
      const s = await login(ctx, '05321112233');
      await onboard(s, { ...ONBOARD_AGENT, marketing: true }).expect(201);
      const res = await ctx
        .http()
        .put('/api/v1/me/consents/marketing')
        .set(bearer(s.accessToken))
        .send({ granted: false })
        .expect(200);
      const marketing = res.body.consents.find(
        (c: { type: string }) => c.type === 'marketing',
      );
      expect(marketing.granted).toBe(false);
    });
  });

  describe('danışman başvurusu ve admin incelemesi', () => {
    let agent: LoggedIn;
    let admin: LoggedIn;

    beforeEach(async () => {
      agent = await login(ctx, '05321112233');
      await onboard(agent, ONBOARD_AGENT).expect(201);
      admin = await loginAsAdmin(ctx);
    });

    const upload = (type: string, content: Buffer, name: string) =>
      ctx
        .http()
        .post('/api/v1/agents/me/documents')
        .set(bearer(agent.accessToken))
        .field('type', type)
        .attach('file', content, name);

    const fillProfile = () =>
      ctx
        .http()
        .patch('/api/v1/agents/me/profile')
        .set(bearer(agent.accessToken))
        .send({
          licenseNumber: '3400123',
          businessName: 'Yılmaz Gayrimenkul',
          city: 'İstanbul',
          district: 'Kadıköy',
        })
        .expect(200);

    it('eksik bilgiyle başvuru gönderilemez ve eksikler listelenir', async () => {
      const res = await ctx
        .http()
        .post('/api/v1/agents/me/submit')
        .set(bearer(agent.accessToken))
        .expect(400);
      expect(res.body.code).toBe('PROFILE_INCOMPLETE');
      expect(res.body.missing).toEqual([
        'licenseNumber',
        'businessName',
        'city',
        'district',
        'document:authority_certificate',
      ]);
    });

    it('uzantısı PDF olsa da içeriği PDF olmayan dosyayı reddeder', async () => {
      const res = await upload(
        'authority_certificate',
        Buffer.from('MZ sahte calistirilabilir'),
        'belge.pdf',
      ).expect(400);
      expect(res.body.code).toBe('FILE_TYPE');
    });

    it('başvuru → ret → düzeltme → onay akışı uçtan uca çalışır', async () => {
      await fillProfile();
      const up = await upload('authority_certificate', PDF, 'yetki-belgesi.pdf').expect(201);
      expect(up.body.missing).toEqual([]);
      const documentId: string = up.body.id;

      // Danışman kendi belgesini görebilir
      await ctx
        .http()
        .get(`/api/v1/agents/me/documents/${documentId}/file`)
        .set(bearer(agent.accessToken))
        .expect(200)
        .expect('content-type', /application\/pdf/);

      const submitted = await ctx
        .http()
        .post('/api/v1/agents/me/submit')
        .set(bearer(agent.accessToken))
        .expect(201);
      expect(submitted.body.status).toBe('pending');

      // İncelemedeyken düzenleme kilitli
      const locked = await ctx
        .http()
        .patch('/api/v1/agents/me/profile')
        .set(bearer(agent.accessToken))
        .send({ city: 'Ankara' })
        .expect(409);
      expect(locked.body.code).toBe('PROFILE_LOCKED');

      // Danışman admin uç noktalarına erişemez
      await ctx
        .http()
        .get('/api/v1/admin/verifications')
        .set(bearer(agent.accessToken))
        .expect(403);

      // Admin bekleyenleri görür
      const list = await ctx
        .http()
        .get('/api/v1/admin/verifications?status=pending')
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toMatchObject({
        userId: agent.userId,
        fullName: 'Ayşe Yılmaz',
        licenseNumber: '3400123',
      });

      const counts = await ctx
        .http()
        .get('/api/v1/admin/verifications/counts')
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(counts.body).toEqual({ draft: 0, pending: 1, approved: 0, rejected: 0 });

      const file = await ctx
        .http()
        .get(`/api/v1/admin/documents/${documentId}/file`)
        .set(bearer(admin.accessToken))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);

      // Gerekçesiz ret yapılamaz
      await ctx
        .http()
        .post(`/api/v1/admin/verifications/${agent.userId}/reject`)
        .set(bearer(admin.accessToken))
        .send({})
        .expect(400);

      const rejected = await ctx
        .http()
        .post(`/api/v1/admin/verifications/${agent.userId}/reject`)
        .set(bearer(admin.accessToken))
        .send({ reason: 'Belge okunmuyor, net bir kopya yükleyin' })
        .expect(200);
      expect(rejected.body.status).toBe('rejected');

      // Danışman gerekçeyi görür, düzeltip yeniden gönderir
      const mine = await ctx
        .http()
        .get('/api/v1/agents/me/verification')
        .set(bearer(agent.accessToken))
        .expect(200);
      expect(mine.body.rejectionReason).toContain('net bir kopya');

      await ctx
        .http()
        .delete(`/api/v1/agents/me/documents/${documentId}`)
        .set(bearer(agent.accessToken))
        .expect(200);
      await upload('authority_certificate', PDF, 'yetki-belgesi-net.pdf').expect(201);
      await ctx
        .http()
        .post('/api/v1/agents/me/submit')
        .set(bearer(agent.accessToken))
        .expect(201);

      // Zaten incelenmiş bir başvuru ikinci kez onaylanamaz; bekleyen onaylanır
      const approved = await ctx
        .http()
        .post(`/api/v1/admin/verifications/${agent.userId}/approve`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(approved.body.status).toBe('approved');
      expect(approved.body.rejectionReason).toBeNull();

      await ctx
        .http()
        .post(`/api/v1/admin/verifications/${agent.userId}/approve`)
        .set(bearer(admin.accessToken))
        .expect(409);

      // Onaylı rozet hem profilde hem herkese açık kartta görünür
      const me = await ctx
        .http()
        .get('/api/v1/me')
        .set(bearer(agent.accessToken))
        .expect(200);
      expect(me.body.agent).toEqual({ verificationStatus: 'approved', isVerified: true });

      const card = await ctx
        .http()
        .get(`/api/v1/agents/${agent.userId}`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(card.body).toMatchObject({
        fullName: 'Ayşe Yılmaz',
        district: 'Kadıköy',
        isVerified: true,
      });
      expect(card.body).not.toHaveProperty('phone');

      // Denetim kaydı
      const actions = (await ctx.db.select().from(auditLogs)).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'user.onboarded',
          'agent.submitted',
          'agent.rejected',
          'agent.approved',
        ]),
      );
    });

    it('başka bir danışmanın belgesine erişilemez', async () => {
      await fillProfile();
      const up = await upload('authority_certificate', PDF, 'yetki.pdf').expect(201);

      const other = await login(ctx, '05327778899');
      await onboard(other, { ...ONBOARD_AGENT, email: 'diger@ornek.com' }).expect(201);
      await ctx
        .http()
        .get(`/api/v1/agents/me/documents/${up.body.id}/file`)
        .set(bearer(other.accessToken))
        .expect(404);
    });
  });
});
