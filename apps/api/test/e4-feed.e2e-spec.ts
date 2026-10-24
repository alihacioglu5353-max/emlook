import { eq } from 'drizzle-orm';
import { listings, users } from '../src/db/schema.js';
import { approvedAgent, createTestApp, login, resetDb, type LoggedIn, type TestContext } from './helpers.js';
import { client, publishListing } from './listing-helpers.js';

describe('E4 — akış, takip, beğeni, kaydetme', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => client(ctx, s);

  async function consumer(phone: string) {
    const s = await login(ctx, phone);
    await api(s)
      .post('/me/onboarding', { fullName: 'Mülk Sahibi', accountType: 'consumer', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    return s;
  }

  it('takip: bildirim gider, tekrar takip sayıyı artırmaz, kendini takip edemez', async () => {
    const ayse = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const mehmet = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');

    const f1 = await api(mehmet).post(`/agents/${ayse.userId}/follow`).expect(200);
    expect(f1.body).toEqual({ agentId: ayse.userId, followerCount: 1, followedByMe: true });
    await api(mehmet).post(`/agents/${ayse.userId}/follow`).expect(200);
    await api(ayse).post(`/agents/${ayse.userId}/follow`).expect(400);

    const notes = await api(ayse).get('/notifications').expect(200);
    expect(notes.body.items.filter((n: { type: string }) => n.type === 'social.followed')).toHaveLength(1);

    const card = await api(mehmet).get(`/agents/${ayse.userId}`).expect(200);
    expect(card.body).toMatchObject({ followerCount: 1, followingCount: 0, followedByMe: true, activeListingCount: 0 });

    const followers = await api(ayse).get(`/users/${ayse.userId}/followers`).expect(200);
    expect(followers.body.items).toEqual([expect.objectContaining({ id: mehmet.userId, fullName: 'Mehmet Demir', isVerified: true })]);
    const following = await api(ayse).get(`/users/${mehmet.userId}/following`).expect(200);
    expect(following.body.items[0]).toMatchObject({ id: ayse.userId, followedByMe: false });

    const un = await api(mehmet).del(`/agents/${ayse.userId}/follow`).expect(200);
    expect(un.body).toMatchObject({ followerCount: 0, followedByMe: false });

    // Mülk sahibi de danışman takip edebilir; mülk sahibi takip edilemez
    const owner = await consumer('05321110009');
    await api(owner).post(`/agents/${ayse.userId}/follow`).expect(200);
    await api(ayse).post(`/agents/${owner.userId}/follow`).expect(404);
  });

  it('Emlook Ağı ve Benim Ağım: kendi ilanın yok, ağ = takip + ofis, sayfalama', async () => {
    const me = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const followed = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const stranger = await approvedAgent(ctx, '05321110003', 'Zeynep Kaya');

    const mine = await publishListing(ctx, me);
    const f1 = await publishListing(ctx, followed, { title: 'Takip edilen 1' });
    const f2 = await publishListing(ctx, followed, { title: 'Takip edilen 2', dealType: 'rent', price: 30_000 });
    const s1 = await publishListing(ctx, stranger, { title: 'Yabancı', visibility: 'public' });
    const sNet = await publishListing(ctx, stranger, { title: 'Yabancı ağ', visibility: 'network' });
    // Yayın sırasını belirgin yap
    for (const [i, id] of [f1, f2, s1, sNet].entries()) {
      await ctx.db.update(listings).set({ publishedAt: new Date(Date.UTC(2026, 9, 1, 10, i)) }).where(eq(listings.id, id));
    }
    await api(me).post(`/agents/${followed.userId}/follow`).expect(200);

    const all = await api(me).get('/feed').expect(200);
    const ids = all.body.items.map((x: { id: string }) => x.id);
    expect(ids).toEqual([s1, f2, f1]); // ağ ilanı yabancıya kapalı, kendi ilanı yok
    expect(ids).not.toContain(mine);
    expect(all.body.nextCursor).toBeNull();

    const net = await api(me).get('/feed?scope=network').expect(200);
    expect(net.body.items.map((x: { id: string }) => x.id)).toEqual([f2, f1]);
    const rent = await api(me).get('/feed?scope=network&dealType=rent').expect(200);
    expect(rent.body.items.map((x: { id: string }) => x.id)).toEqual([f2]);

    const p1 = await api(me).get('/feed?limit=2').expect(200);
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toEqual(expect.any(String));
    const p2 = await api(me).get(`/feed?limit=2&cursor=${p1.body.nextCursor}`).expect(200);
    expect(p2.body.items.map((x: { id: string }) => x.id)).toEqual([f1]);
    expect(p2.body.nextCursor).toBeNull();
    await api(me).get('/feed?cursor=bozuk').expect(400);

    // Askıya alınan danışmanın ilanları akıştan düşer
    await ctx.db.update(users).set({ status: 'suspended' }).where(eq(users.id, stranger.userId));
    const after = await api(me).get('/feed').expect(200);
    expect(after.body.items.map((x: { id: string }) => x.id)).toEqual([f2, f1]);

    // Profil: danışmanın yayındaki ilanları
    const prof = await api(me).get(`/agents/${followed.userId}/listings`).expect(200);
    expect(prof.body.items).toHaveLength(2);
  });

  it('beğeni ve kaydetme: sayaçlar, bildirim, kaydedilenler listesi', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const fan = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const id = await publishListing(ctx, owner);
    const draft = (await api(owner).post('/listings', {
      dealType: 'sale', category: 'land', title: 'Taslak arsa', price: 1000, cityCode: '06',
      districtId: (await api(owner).get('/locations/cities/06/districts')).body[0].id, cobrokeShare: 0,
    }).expect(201)).body.id;

    const l1 = await api(fan).post(`/listings/${id}/like`).expect(200);
    expect(l1.body).toEqual({ listingId: id, likeCount: 1, likedByMe: true, savedByMe: false });
    await api(fan).post(`/listings/${id}/like`).expect(200);
    await api(owner).post(`/listings/${id}/like`).expect(200); // kendi ilanını beğenmek bildirim üretmez
    const notes = await api(owner).get('/notifications').expect(200);
    expect(notes.body.items.filter((n: { type: string }) => n.type === 'listing.liked')).toHaveLength(1);

    await api(fan).post(`/listings/${draft}/like`).expect(404);
    await api(owner).post(`/listings/${draft}/save`).expect(400);

    const s = await api(fan).post(`/listings/${id}/save`).expect(200);
    expect(s.body).toMatchObject({ likeCount: 2, likedByMe: true, savedByMe: true });
    const feed = await api(fan).get('/feed').expect(200);
    expect(feed.body.items[0]).toMatchObject({ id, likeCount: 2, likedByMe: true, savedByMe: true });

    const saved = await api(fan).get('/me/saved').expect(200);
    expect(saved.body.items.map((x: { id: string }) => x.id)).toEqual([id]);

    // Pasife alınan ilan kaydedilenlerde görünmez, kayıt silinmez
    await api(owner).post(`/listings/${id}/deactivate`).expect(200);
    expect((await api(fan).get('/me/saved').expect(200)).body.items).toHaveLength(0);

    await api(owner).post(`/listings/${id}/publish`).expect(200);
    await api(fan).del(`/listings/${id}/save`).expect(200);
    const un = await api(fan).del(`/listings/${id}/like`).expect(200);
    expect(un.body).toMatchObject({ likeCount: 1, likedByMe: false, savedByMe: false });
  });

  it('takip önerileri: onaylı, takip edilmeyen, aynı il önce', async () => {
    const me = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const a = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const b = await approvedAgent(ctx, '05321110003', 'Zeynep Kaya');
    const sug = await api(me).get('/me/suggestions').expect(200);
    const ids = sug.body.map((x: { id: string }) => x.id);
    expect(ids).toEqual(expect.arrayContaining([a.userId, b.userId]));
    expect(ids).not.toContain(me.userId);

    await api(me).post(`/agents/${a.userId}/follow`).expect(200);
    const again = await api(me).get('/me/suggestions').expect(200);
    expect(again.body.map((x: { id: string }) => x.id)).toEqual([b.userId]);
  });
});
