import { eq } from 'drizzle-orm';
import { agentProfiles, listings, listingSwipes } from '../src/db/schema.js';
import { approvedAgent, createTestApp, login, resetDb, type LoggedIn, type TestContext } from './helpers.js';
import { client, districtId, publishListing } from './listing-helpers.js';

describe('E5 — keşfet ve eşleşme', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => client(ctx, s);
  const ids = (body: { items: { id: string }[] }) => body.items.map((x) => x.id);

  it('kartlar: bölgeye göre öne çıkar, kendi ve karar verilmiş ilanlar gelmez', async () => {
    const me = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    await ctx.db.update(agentProfiles).set({ city: 'İstanbul', district: 'Kadıköy' }).where(eq(agentProfiles.userId, me.userId));
    const other = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');

    await publishListing(ctx, me);
    const ankara = await publishListing(ctx, other, {
      cityCode: '06',
      districtId: await districtId(ctx, '06', 'Çankaya'),
      title: 'Çankaya merkezde daire',
    });
    const besiktas = await publishListing(ctx, other, { districtId: await districtId(ctx, '34', 'Beşiktaş') });
    const kadikoy = await publishListing(ctx, other);
    // Ankara ilanı daha yeni olsa da bölge puanı İstanbul'u öne çıkarır
    await ctx.db.update(listings).set({ publishedAt: new Date(Date.now() - 5 * 86400_000) }).where(eq(listings.id, kadikoy));

    const res = await api(me).get('/discover').expect(200);
    expect(ids(res.body)).toEqual([kadikoy, besiktas, ankara]);
    expect(res.body.canUndo).toBe(false);

    const only06 = await api(me).get('/discover?cityCode=06').expect(200);
    expect(ids(only06.body)).toEqual([ankara]);

    await api(me).post(`/discover/${kadikoy}/swipe`, { decision: 'pass' }).expect(200);
    await api(me).post(`/discover/${kadikoy}/swipe`, { decision: 'pass' }).expect(409);
    const after = await api(me).get('/discover').expect(200);
    expect(ids(after.body)).toEqual([besiktas, ankara]);
    expect(after.body.canUndo).toBe(true);
  });

  it('sağa kaydırma ilgi gönderir; ilan sahibi kabul eder → eşleşme bildirimi', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const buyer = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const id = await publishListing(ctx, owner, { title: 'Moda sahil 3+1' });

    const s = await api(buyer).post(`/discover/${id}/swipe`, { decision: 'like', note: 'Alıcım hazır' }).expect(200);
    expect(s.body.interest).toMatchObject({ status: 'pending' });
    await api(owner).post(`/discover/${id}/swipe`, { decision: 'like' }).expect(400);

    const incoming = await api(owner).get('/interests/incoming').expect(200);
    expect(incoming.body.counts.pending).toBe(1);
    const item = incoming.body.items[0];
    expect(item).toMatchObject({
      status: 'pending',
      note: 'Alıcım hazır',
      fromDiscover: true,
      listing: { id, title: 'Moda sahil 3+1', location: { district: 'Kadıköy' } },
      requester: { id: buyer.userId, fullName: 'Mehmet Demir', isAgent: true, isVerified: true },
    });
    expect(item.listing.coverPhoto).toMatch(/^\/listings\//);

    // Detaydan ikinci "ilgileniyorum" aynı kaydı döndürür
    const again = await api(buyer).post(`/listings/${id}/interest`, {}).expect(200);
    expect(again.body.id).toBe(item.id);
    expect((await api(buyer).get(`/listings/${id}/interest`).expect(200)).body.interest.id).toBe(item.id);

    // Yalnızca sahip yanıtlar
    await api(buyer).post(`/interests/${item.id}/accept`).expect(403);
    const acc = await api(owner).post(`/interests/${item.id}/accept`).expect(200);
    expect(acc.body.status).toBe('accepted');
    await api(owner).post(`/interests/${item.id}/decline`).expect(409);
    await api(buyer).post(`/interests/${item.id}/withdraw`).expect(409);

    const notesOwner = (await api(owner).get('/notifications').expect(200)).body.items.map((n: { type: string }) => n.type);
    const notesBuyer = (await api(buyer).get('/notifications').expect(200)).body.items.map((n: { type: string }) => n.type);
    expect(notesOwner).toContain('interest.received');
    expect(notesBuyer).toContain('interest.accepted');

    const out = await api(buyer).get('/interests/outgoing?status=accepted').expect(200);
    expect(out.body.items).toHaveLength(1);

    // Üçüncü kişi talebi göremez
    const stranger = await approvedAgent(ctx, '05321110003', 'Zeynep Kaya');
    await api(stranger).get(`/interests/${item.id}`).expect(404);
  });

  it('geri al: son karar silinir, bekleyen ilgi geri çekilir; süre dolunca geri alınamaz', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const buyer = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const a = await publishListing(ctx, owner);
    const b = await publishListing(ctx, owner);

    await api(buyer).post(`/discover/${a}/swipe`, { decision: 'pass' }).expect(200);
    await api(buyer).post(`/discover/${b}/swipe`, { decision: 'like' }).expect(200);

    const u1 = await api(buyer).post('/discover/undo').expect(200);
    expect(u1.body.restored.id).toBe(b);
    expect(u1.body.canUndo).toBe(true);
    const out = await api(buyer).get('/interests/outgoing').expect(200);
    expect(out.body.counts).toMatchObject({ pending: 0, withdrawn: 1 });

    // Süresi geçmiş karar geri alınamaz
    await ctx.db
      .update(listingSwipes)
      .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(listingSwipes.listingId, a));
    await api(buyer).post('/discover/undo').expect(400);

    // Geri alınan ilan tekrar kartlarda; yeniden beğenilebilir
    expect(ids((await api(buyer).get('/discover').expect(200)).body)).toEqual([b]);
    const again = await api(buyer).post(`/discover/${b}/swipe`, { decision: 'like' }).expect(200);
    expect(again.body.interest.status).toBe('pending');
  });

  it('mülk sahibi de ilgi gösterebilir; talep eden geri çekebilir', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const consumer = await login(ctx, '05321110009');
    await api(consumer)
      .post('/me/onboarding', { fullName: 'Can Alıcı', accountType: 'consumer', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    const id = await publishListing(ctx, owner, { visibility: 'public' });
    const hidden = await publishListing(ctx, owner, { visibility: 'agents' });

    expect(ids((await api(consumer).get('/discover').expect(200)).body)).toEqual([id]);
    await api(consumer).post(`/listings/${hidden}/interest`, {}).expect(404);
    const i = await api(consumer).post(`/listings/${id}/interest`, { note: 'Hafta sonu görebilir miyim?' }).expect(200);
    expect(i.body).toMatchObject({ status: 'pending', requester: { isAgent: false }, fromDiscover: false });

    const w = await api(consumer).post(`/interests/${i.body.id}/withdraw`).expect(200);
    expect(w.body.status).toBe('withdrawn');
    expect((await api(consumer).get(`/listings/${id}/interest`).expect(200)).body.interest).toBeNull();
  });
});
