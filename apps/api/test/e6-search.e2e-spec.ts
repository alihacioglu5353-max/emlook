import { approvedAgent, createTestApp, login, resetDb, type LoggedIn, type TestContext } from './helpers.js';
import { client, districtId, publishListing } from './listing-helpers.js';

describe('E6 — arama', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => client(ctx, s);
  const titles = (body: { items: { title: string }[] }) => body.items.map((x) => x.title).sort();

  async function seed() {
    const ayse = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const mehmet = await approvedAgent(ctx, '05321110002', 'Mehmet Çelik');
    const kadikoy = await districtId(ctx, '34', 'Kadıköy');
    const besiktas = await districtId(ctx, '34', 'Beşiktaş');
    const cankaya = await districtId(ctx, '06', 'Çankaya');
    await publishListing(ctx, ayse, { title: 'Moda 3+1 deniz manzaralı', rooms: '3+1', price: 9_500_000, netM2: 120, districtId: kadikoy, description: 'Otoparklı, asansörlü' });
    await publishListing(ctx, ayse, { title: 'Kadıköy 2+1 bütçe dostu', rooms: '2+1', price: 6_000_000, netM2: 85, districtId: kadikoy });
    await publishListing(ctx, mehmet, { title: 'Kadıköy kiralık 3+1', dealType: 'rent', rooms: '3+1', price: 45_000, netM2: 115, districtId: kadikoy });
    await publishListing(ctx, mehmet, { title: 'Bebek lüks 3+1', rooms: '3+1', price: 25_000_000, netM2: 180, districtId: besiktas });
    await publishListing(ctx, mehmet, { title: 'Çankaya arsa', category: 'land', rooms: null, price: 3_000_000, cityCode: '06', districtId: cankaya });
    return { ayse, mehmet, kadikoy };
  }

  it('serbest metin: ilçe + tip + oda + fiyat sınırı ayrıştırılır', async () => {
    const { ayse } = await seed();
    const r = await api(ayse).get(`/search?q=${encodeURIComponent('kadıköy satılık 3+1 10 milyon altı')}`).expect(200);
    expect(r.body.parsed).toMatchObject({
      dealType: 'sale',
      rooms: '3+1',
      maxPrice: 10_000_000,
      district: { name: 'Kadıköy' },
      city: { name: 'İstanbul' },
    });
    expect(titles(r.body)).toEqual(['Moda 3+1 deniz manzaralı']);
    expect(r.body.total).toBe(1);
  });

  it('kalan kelimeler başlık, mahalle ve açıklamada aranır; Türkçe karakterden bağımsız', async () => {
    const { ayse } = await seed();
    const r1 = await api(ayse).get(`/search?q=${encodeURIComponent('DENİZ manzarali')}`).expect(200);
    expect(titles(r1.body)).toEqual(['Moda 3+1 deniz manzaralı']);
    const r2 = await api(ayse).get(`/search?q=otoparkli`).expect(200);
    expect(r2.body.items).toHaveLength(1);
    const r3 = await api(ayse).get(`/search?q=${encodeURIComponent('ankara arsa')}`).expect(200);
    expect(titles(r3.body)).toEqual(['Çankaya arsa']);
    const none = await api(ayse).get(`/search?q=${encodeURIComponent('kadıköy villa')}`).expect(200);
    expect(none.body.items).toHaveLength(0);
  });

  it('açık filtreler, sıralama ve sayfalama', async () => {
    const { ayse } = await seed();
    const rent = await api(ayse).get('/search?dealType=rent').expect(200);
    expect(titles(rent.body)).toEqual(['Kadıköy kiralık 3+1']);

    const asc = await api(ayse).get('/search?dealType=sale&cityCode=34&sort=price_asc').expect(200);
    expect(asc.body.items.map((x: { price: number }) => x.price)).toEqual([6_000_000, 9_500_000, 25_000_000]);

    const m2 = await api(ayse).get('/search?minM2=100&maxM2=130').expect(200);
    expect(titles(m2.body)).toEqual(['Kadıköy kiralık 3+1', 'Moda 3+1 deniz manzaralı']);

    const p1 = await api(ayse).get('/search?limit=2&sort=price_desc').expect(200);
    expect(p1.body).toMatchObject({ total: 5, nextOffset: 2 });
    const p3 = await api(ayse).get('/search?limit=2&offset=4&sort=price_desc').expect(200);
    expect(p3.body.items.map((x: { price: number }) => x.price)).toEqual([45_000]);
    expect(p3.body.nextOffset).toBeNull();

    const mine = await api(ayse).get('/search?excludeMine=true').expect(200);
    expect(mine.body.total).toBe(3);

    // Açık il parametresi ayrıştırılan ilçeyi geçersiz kılar
    const over = await api(ayse).get(`/search?q=kadikoy&cityCode=06`).expect(200);
    expect(titles(over.body)).toEqual(['Çankaya arsa']);
  });

  it('mülk sahibi yalnızca herkese açık ilanları bulur; danışman araması', async () => {
    const { mehmet } = await seed();
    await publishListing(ctx, mehmet, { title: 'Kadıköy gizli portföy', visibility: 'agents' });
    const consumer = await login(ctx, '05321110009');
    await api(consumer)
      .post('/me/onboarding', { fullName: 'Can', accountType: 'consumer', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    const r = await api(consumer).get('/search?q=kadikoy').expect(200);
    expect(r.body.items.map((x: { title: string }) => x.title)).not.toContain('Kadıköy gizli portföy');
    expect(r.body.items.every((x: { cobrokeShare: number | null }) => x.cobrokeShare === null)).toBe(true);

    const agents = await api(consumer).get(`/search/agents?q=${encodeURIComponent('mehmet celik')}`).expect(200);
    expect(agents.body).toEqual([expect.objectContaining({ id: mehmet.userId, fullName: 'Mehmet Çelik', activeListingCount: 4 })]);
    expect((await api(consumer).get('/search/agents?q=yok').expect(200)).body).toEqual([]);
  });
});
