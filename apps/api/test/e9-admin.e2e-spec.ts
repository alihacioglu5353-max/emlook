import { eq } from 'drizzle-orm';
import { listings } from '../src/db/schema.js';
import { approvedAgent, createTestApp, login, loginAsAdmin, resetDb, type LoggedIn, type TestContext } from './helpers.js';
import { client, publishListing } from './listing-helpers.js';

describe('E9 — yönetim paneli', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => client(ctx, s);

  it('özet ve kullanıcı listesi; yalnızca yönetici', async () => {
    const admin = await loginAsAdmin(ctx);
    const ayse = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    await publishListing(ctx, ayse);
    const c = await login(ctx, '05321110009');
    await api(c).post('/me/onboarding', { fullName: 'Can Alıcı', accountType: 'consumer', kvkkClarification: true, termsOfUse: true }).expect(201);

    await api(ayse).get('/admin/dashboard').expect(403);
    const d = await api(admin).get('/admin/dashboard').expect(200);
    expect(d.body).toMatchObject({ agents: 1, consumers: 1, verifiedAgents: 1, activeListings: 1, openReports: 0, paidVolume: 0 });

    const all = await api(admin).get('/admin/users').expect(200);
    expect(all.body.total).toBe(3);
    const agents = await api(admin).get('/admin/users?role=agent').expect(200);
    expect(agents.body.items).toEqual([expect.objectContaining({ fullName: 'Ayşe Yılmaz', activeListings: 1, verification: 'approved' })]);
    const byPhone = await api(admin).get('/admin/users?q=0532 111 00 09').expect(200);
    expect(byPhone.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(['Can Alıcı']);
    const byName = await api(admin).get(`/admin/users?q=${encodeURIComponent('ayşe')}`).expect(200);
    expect(byName.body.total).toBe(1);
  });

  it('askıya alma: oturum kapanır, ilanları gizlenir; yeniden etkinleştirme', async () => {
    const admin = await loginAsAdmin(ctx);
    const ayse = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const viewer = await approvedAgent(ctx, '05321110002', 'Mehmet');
    const id = await publishListing(ctx, ayse);

    await api(admin).post(`/admin/users/${admin.userId}/suspend`, { reason: 'deneme amaçlı' }).expect(400);
    const s = await api(admin).post(`/admin/users/${ayse.userId}/suspend`, { reason: 'Sahte ilan şikâyetleri' }).expect(200);
    expect(s.body).toMatchObject({ status: 'suspended', suspendedReason: 'Sahte ilan şikâyetleri', stats: { activeSessions: 0 } });

    await api(ayse).get('/me').expect(401);
    await ctx.http().post('/api/v1/auth/refresh').send({ refreshToken: ayse.refreshToken }).expect(401);
    await api(viewer).get(`/listings/${id}`).expect(404);
    expect((await api(viewer).get('/feed').expect(200)).body.items).toHaveLength(0);
    // Yönetici görmeye devam eder
    await api(admin).get(`/listings/${id}`).expect(200);

    await api(admin).post(`/admin/users/${ayse.userId}/reactivate`).expect(200);
    await api(viewer).get(`/listings/${id}`).expect(200);
  });

  it('şikâyet → ilan kaldırma → geri yükleme; şikâyet reddi', async () => {
    const admin = await loginAsAdmin(ctx);
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const r1 = await approvedAgent(ctx, '05321110002', 'Mehmet');
    const r2 = await approvedAgent(ctx, '05321110003', 'Zeynep');
    const id = await publishListing(ctx, owner, { title: 'Şüpheli ilan' });
    const other = await publishListing(ctx, owner, { title: 'Normal ilan' });

    await api(owner).post(`/listings/${id}/report`, { reason: 'fraud' }).expect(400);
    await api(r1).post(`/listings/${id}/report`, { reason: 'fraud', note: 'Aynı daire başka şehirde' }).expect(201);
    await api(r1).post(`/listings/${id}/report`, { reason: 'duplicate' }).expect(409);
    await api(r2).post(`/listings/${id}/report`, { reason: 'wrong_price' }).expect(201);
    const x = await api(r2).post(`/listings/${other}/report`, { reason: 'other' }).expect(201);

    const open = await api(admin).get('/admin/reports').expect(200);
    expect(open.body.items).toHaveLength(3);
    expect(open.body.items.find((r: { listing: { id: string } }) => r.listing.id === id).sameListingOpen).toBe(2);

    const removed = await api(admin).post(`/admin/listings/${id}/remove`, { reason: 'Yanıltıcı konum bilgisi' }).expect(200);
    expect(removed.body).toMatchObject({ status: 'removed', removedReason: 'Yanıltıcı konum bilgisi' });
    expect((await api(admin).get('/admin/reports').expect(200)).body.items).toHaveLength(1);
    expect((await api(admin).get('/admin/reports?status=resolved').expect(200)).body.items).toHaveLength(2);
    await api(r1).get(`/listings/${id}`).expect(404);
    // Sahibi düzenleyemez, gerekçeyi görür; bildirim alır
    await api(owner).patch(`/listings/${id}`, { title: 'Değiştirmeye çalış' }).expect(409);
    const notes = (await api(owner).get('/notifications').expect(200)).body.items.map((n: { type: string }) => n.type);
    expect(notes).toContain('listing.removed');

    await api(admin).post(`/admin/reports/${x.body.id}/dismiss`, { note: 'İlan uygun' }).expect(200);
    await api(admin).post(`/admin/reports/${x.body.id}/dismiss`, {}).expect(409);

    const back = await api(admin).post(`/admin/listings/${id}/restore`).expect(200);
    expect(back.body.status).toBe('passive');
    await api(owner).post(`/listings/${id}/publish`).expect(200);

    const list = await api(admin).get('/admin/listings?status=active&q=şüpheli').expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({ id, title: 'Şüpheli ilan', openReports: 0 })]);
  });

  it('EİDS elle doğrulama (manual sağlayıcı akışı)', async () => {
    const admin = await loginAsAdmin(ctx);
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const c = await api(owner)
      .post('/listings', {
        dealType: 'sale', category: 'apartment', title: 'EİDS bekleyen ilan', price: 1_000_000, cityCode: '34',
        districtId: (await api(owner).get('/locations/cities/34/districts')).body[0].id, cobrokeShare: 50, propertyNumber: '777888999',
      })
      .expect(201);
    // Manual sağlayıcıyı taklit et: inceleme bekliyor
    await ctx.db.update(listings).set({ eidsStatus: 'pending' }).where(eq(listings.id, c.body.id));

    const pending = await api(admin).get('/admin/listings?eids=pending').expect(200);
    expect(pending.body.items.map((l: { id: string }) => l.id)).toEqual([c.body.id]);

    const failed = await api(admin).post(`/admin/listings/${c.body.id}/eids`, { decision: 'failed', message: 'Yetki belgesi bu taşınmazla eşleşmiyor' }).expect(200);
    expect(failed.body.eids).toEqual({ verified: false });
    const ok = await api(admin).post(`/admin/listings/${c.body.id}/eids`, { decision: 'verified' }).expect(200);
    expect(ok.body.eids.verified).toBe(true);
    await api(admin).post(`/admin/listings/${c.body.id}/eids`, { decision: 'failed' }).expect(409);

    const mine = await api(owner).get(`/listings/${c.body.id}`).expect(200);
    expect(mine.body.eids).toMatchObject({ status: 'verified', message: 'Yetki yönetici tarafından doğrulandı' });
    const types = (await api(owner).get('/notifications').expect(200)).body.items.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(['listing.eids_failed', 'listing.eids_verified']));
  });

  it('ödeme listesi ve özet gelirleri', async () => {
    const admin = await loginAsAdmin(ctx);
    const s = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    await api(s).put('/me/payout-account', { holderName: 'Ayşe', iban: 'TR330006100519786457841326', taxId: '10000000146' }).expect(200);
    const r = await api(s).post('/payments/requests', { amount: 2_000_000, description: 'Kira komisyonu', payerName: 'Ece' }).expect(201);
    const token = r.body.link.split('/odeme/')[1];
    const co = await ctx.http().post(`/api/v1/pay/${token}/checkout`).expect(200);
    await ctx.http().post(`/api/v1/pay/${token}/mock-complete`).send({ sessionId: co.body.sessionId, outcome: 'success' }).expect(200);

    const p = await api(admin).get('/admin/payments?status=paid').expect(200);
    expect(p.body.items).toEqual([
      expect.objectContaining({ amount: 2_000_000, platformFee: 100_000, seller: expect.objectContaining({ fullName: 'Ayşe Yılmaz' }), buyerAgent: null, invoiceStatus: 'pending' }),
    ]);
    const d = await api(admin).get('/admin/dashboard').expect(200);
    expect(d.body).toMatchObject({ paidPayments: 1, paidVolume: 2_000_000, platformRevenue: 100_000, pendingInvoices: 1 });
  });
});
