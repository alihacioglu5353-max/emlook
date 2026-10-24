import { eq } from 'drizzle-orm';
import { agentProfiles, appSettings, auditLogs, users } from '../src/db/schema.js';
import {
  approvedAgent,
  bearer,
  createTestApp,
  JPEG,
  login,
  loginAsAdmin,
  PDF,
  resetDb,
  type TestContext,
} from './helpers.js';
import { publishListing } from './listing-helpers.js';

/** BMP başlığı (BM + boyut) — içerikten tür tanıma için yeterli */
const BMP = Buffer.concat([Buffer.from('BM'), Buffer.alloc(60, 1)]);

describe('Yönetim ayarları, evrak türleri, rozetler, avatar ve loglar', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  it('genel ayarlar yeni ödeme taleplerine uygulanır; yetkisiz erişim reddedilir', async () => {
    const admin = await loginAsAdmin(ctx);
    const ayse = await approvedAgent(ctx, '05321230001', 'Ayşe Yılmaz');
    await ctx.http().get('/api/v1/admin/settings').set(bearer(ayse.accessToken)).expect(403);

    const all = await ctx.http().get('/api/v1/admin/settings').set(bearer(admin.accessToken)).expect(200);
    expect(all.body.general.platformFeeBps).toBe(500);
    expect(all.body.integrations.map((i: { name: string }) => i.name)).toContain('netgsm');

    await ctx.http().put('/api/v1/admin/settings/general').set(bearer(admin.accessToken)).send({ platformFeeBps: 99999 }).expect(400);
    const saved = await ctx
      .http()
      .put('/api/v1/admin/settings/general')
      .set(bearer(admin.accessToken))
      .send({ platformFeeBps: 750, announcement: 'Bakım: Pazar 02:00' })
      .expect(200);
    expect(saved.body.platformFeeBps).toBe(750);
    const pub = await ctx.http().get('/api/v1/settings/public').expect(200);
    expect(pub.body.announcement).toBe('Bakım: Pazar 02:00');
    const summary = await ctx.http().get('/api/v1/payments/summary').set(bearer(ayse.accessToken)).expect(200);
    expect(summary.body.platformFeeBps).toBe(750);
  });

  it('entegrasyon gizli alanları şifreli saklanır ve maskeli döner', async () => {
    const admin = await loginAsAdmin(ctx);
    const missing = await ctx
      .http()
      .put('/api/v1/admin/settings/integrations/netgsm')
      .set(bearer(admin.accessToken))
      .send({ enabled: true, userCode: '8501112233' })
      .expect(400);
    expect(missing.body.message).toContain('API parolası');

    const ok = await ctx
      .http()
      .put('/api/v1/admin/settings/integrations/netgsm')
      .set(bearer(admin.accessToken))
      .send({ enabled: false, userCode: '8501112233', password: 'cokgizli1234', header: 'EMLOOK' })
      .expect(200);
    expect(ok.body.values.password).toEqual({ configured: true, hint: '••••1234' });
    const [row] = await ctx.db.select().from(appSettings).where(eq(appSettings.key, 'integration.netgsm'));
    expect(JSON.stringify(row!.value)).not.toContain('cokgizli1234');

    // Boş gizli alan mevcut değeri korur
    const kept = await ctx
      .http()
      .put('/api/v1/admin/settings/integrations/netgsm')
      .set(bearer(admin.accessToken))
      .send({ password: '', header: 'EMLOOKAPP' })
      .expect(200);
    expect(kept.body.values.password.configured).toBe(true);
    expect(kept.body.values.header).toBe('EMLOOKAPP');
    await ctx.http().put('/api/v1/admin/settings/integrations/bilinmeyen').set(bearer(admin.accessToken)).send({}).expect(400);
  });

  it('yöneticinin zorunlu kıldığı evrak olmadan başvuru gönderilemez; BMP kabul, metin reddedilir', async () => {
    const admin = await loginAsAdmin(ctx);
    const created = await ctx
      .http()
      .post('/api/v1/admin/document-types')
      .set(bearer(admin.accessToken))
      .send({ key: 'tax_plate_x', label: 'Vergi levhası (test)', required: true })
      .expect(201);
    await ctx.http().post('/api/v1/admin/document-types').set(bearer(admin.accessToken)).send({ key: 'tax_plate_x', label: 'Tekrar', required: false }).expect(409);

    const s = await login(ctx, '05321230002');
    await ctx
      .http()
      .post('/api/v1/me/onboarding')
      .set(bearer(s.accessToken))
      .send({ fullName: 'Can Danışman', accountType: 'agent', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    const types = await ctx.http().get('/api/v1/agents/document-types').set(bearer(s.accessToken)).expect(200);
    expect(types.body.find((t: { key: string }) => t.key === 'tax_plate_x')).toMatchObject({ required: true });

    await ctx
      .http()
      .patch('/api/v1/agents/me/profile')
      .set(bearer(s.accessToken))
      .send({ licenseNumber: '3401234', businessName: 'Can Emlak', city: 'İstanbul', district: 'Kadıköy' })
      .expect(200);
    await ctx.http().post('/api/v1/agents/me/documents').set(bearer(s.accessToken)).field('type', 'authority_certificate').attach('file', PDF, 'yetki.pdf').expect(201);
    const blocked = await ctx.http().post('/api/v1/agents/me/submit').set(bearer(s.accessToken)).expect(400);
    expect(blocked.body.missing).toContain('document:tax_plate_x');

    await ctx.http().post('/api/v1/agents/me/documents').set(bearer(s.accessToken)).field('type', 'yok_boyle').attach('file', PDF, 'x.pdf').expect(400);
    const txt = await ctx.http().post('/api/v1/agents/me/documents').set(bearer(s.accessToken)).field('type', 'tax_plate_x').attach('file', Buffer.from('merhaba'), 'a.txt').expect(400);
    expect(txt.body.message).toContain('BMP');
    await ctx.http().post('/api/v1/agents/me/documents').set(bearer(s.accessToken)).field('type', 'tax_plate_x').attach('file', BMP, 'levha.bmp').expect(201);
    await ctx.http().post('/api/v1/agents/me/submit').set(bearer(s.accessToken)).expect(201);

    // Belgesi olan tür silinemez, pasife alınabilir
    await ctx.http().delete(`/api/v1/admin/document-types/${created.body.id}`).set(bearer(admin.accessToken)).expect(409);
    await ctx
      .http()
      .patch(`/api/v1/admin/document-types/${created.body.id}`)
      .set(bearer(admin.accessToken))
      .send({ key: 'tax_plate_x', label: 'Vergi levhası (test)', required: false, active: false })
      .expect(200);
  });

  it('profil resmi yüklenir veya hazır avatar seçilir; PDF profil resmi olamaz', async () => {
    const s = await approvedAgent(ctx, '05321230003', 'Zeynep Demir');
    await ctx.http().post('/api/v1/me/avatar').set(bearer(s.accessToken)).attach('file', PDF, 'a.pdf').expect(400);
    const up = await ctx.http().post('/api/v1/me/avatar').set(bearer(s.accessToken)).attach('file', JPEG, 'ben.jpg').expect(201);
    expect(up.body.avatar.kind).toBe('photo');
    const img = await ctx.http().get(up.body.avatar.url.replace(/^/, '/api/v1')).set(bearer(s.accessToken)).expect(200);
    expect(img.headers['content-type']).toContain('image/jpeg');

    await ctx.http().put('/api/v1/me/avatar').set(bearer(s.accessToken)).send({ preset: 'p99' }).expect(400);
    const preset = await ctx.http().put('/api/v1/me/avatar').set(bearer(s.accessToken)).send({ preset: 'p03' }).expect(200);
    expect(preset.body.avatar).toEqual({ kind: 'preset', preset: 'p03' });
    const me = await ctx.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(200);
    expect(me.body.avatar).toEqual({ kind: 'preset', preset: 'p03' });
    await ctx.http().get(`/api/v1/users/${s.userId}/avatar`).set(bearer(s.accessToken)).expect(404);
  });

  it('rozet puanı ayarlardaki ağırlıklarla hesaplanır ve kartlarda görünür', async () => {
    const admin = await loginAsAdmin(ctx);
    const ayse = await approvedAgent(ctx, '05321230004', 'Ayşe Yılmaz');
    await publishListing(ctx, ayse);
    await publishListing(ctx, ayse);

    const bad = await ctx
      .http()
      .put('/api/v1/admin/settings/badges')
      .set(bearer(admin.accessToken))
      .send({ weights: {}, tiers: [{ key: 'a', label: 'A', minScore: 5, color: 'ink' }] })
      .expect(400);
    expect(bad.body.message).toContain('0');

    const res = await ctx
      .http()
      .put('/api/v1/admin/settings/badges')
      .set(bearer(admin.accessToken))
      .send({
        weights: { activeListing: 10, soldListing: 0, eidsVerified: 0, match: 0, likeReceived: 0, follower: 0, paidPayment: 0, accountMonth: 0, profileComplete: 0 },
        tiers: [
          { key: 'new', label: 'Yeni', minScore: 0, color: 'ink' },
          { key: 'gold', label: 'Altın', minScore: 20, color: 'gold' },
        ],
      })
      .expect(200);
    expect(res.body.distribution.find((d: { key: string }) => d.key === 'gold').count).toBe(1);
    const [p] = await ctx.db.select({ score: agentProfiles.score, badge: agentProfiles.badge }).from(agentProfiles).where(eq(agentProfiles.userId, ayse.userId));
    expect(p).toEqual({ score: 20, badge: 'gold' });

    const profile = await ctx.http().get(`/api/v1/agents/${ayse.userId}`).set(bearer(admin.accessToken)).expect(200);
    expect(profile.body).toMatchObject({ badge: 'gold', score: 20 });
    const pub = await ctx.http().get('/api/v1/settings/public').expect(200);
    expect(pub.body.badgeTiers.map((t: { key: string }) => t.key)).toEqual(['new', 'gold']);
  });

  it('log ekranı giriş olaylarını, çevrimiçi kullanıcıları ve oturumları gösterir', async () => {
    const admin = await loginAsAdmin(ctx);
    const s = await login(ctx, '05321230005');
    await ctx.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(200);
    await new Promise((r) => setTimeout(r, 150)); // son görülme arka planda yazılır

    const overview = await ctx.http().get('/api/v1/admin/logs/overview').set(bearer(admin.accessToken)).expect(200);
    expect(overview.body.logins24h).toBeGreaterThanOrEqual(2);
    expect(overview.body.online).toBeGreaterThanOrEqual(1);
    expect(overview.body.hourly).toHaveLength(24);

    const online = await ctx.http().get('/api/v1/admin/logs/online').set(bearer(admin.accessToken)).expect(200);
    expect(online.body.items.map((u: { id: string }) => u.id)).toContain(s.userId);

    const events = await ctx.http().get('/api/v1/admin/logs/events?category=auth').set(bearer(admin.accessToken)).expect(200);
    expect(events.body.items.every((e: { action: string }) => /^(auth|password|session)\./.test(e.action))).toBe(true);
    expect(events.body.items[0]).toHaveProperty('ip');

    const sessions = await ctx.http().get('/api/v1/admin/logs/sessions').set(bearer(admin.accessToken)).expect(200);
    const mine = sessions.body.items.find((x: { userId: string }) => x.userId === s.userId);
    await ctx.http().delete(`/api/v1/admin/logs/sessions/${mine.id}`).set(bearer(admin.accessToken)).expect(200);
    await ctx.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(401);
    const revoked = await ctx.db.select().from(auditLogs).where(eq(auditLogs.action, 'session.revoked'));
    expect(revoked).toHaveLength(1);

    await ctx.http().post('/api/v1/auth/logout').set(bearer(admin.accessToken)).expect(204);
    const [u] = await ctx.db.select({ seen: users.lastSeenAt }).from(users).where(eq(users.id, s.userId));
    expect(u!.seen).not.toBeNull();
  });
});
