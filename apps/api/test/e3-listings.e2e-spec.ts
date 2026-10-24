import { and, eq } from 'drizzle-orm';
import { districts, follows, neighbourhoods } from '../src/db/schema.js';
import {
  approvedAgent,
  bearer,
  createTestApp,
  JPEG,
  login,
  loginAsAdmin,
  PDF,
  resetDb,
  type LoggedIn,
  type TestContext,
} from './helpers.js';

describe('E3 — portföy', () => {
  let ctx: TestContext;
  let kadikoy: number;
  let besiktas: number;
  let moda: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    const [k] = await ctx.db
      .select({ id: districts.id })
      .from(districts)
      .where(and(eq(districts.cityCode, '34'), eq(districts.name, 'Kadıköy')));
    const [b] = await ctx.db
      .select({ id: districts.id })
      .from(districts)
      .where(and(eq(districts.cityCode, '34'), eq(districts.name, 'Beşiktaş')));
    const [m] = await ctx.db
      .select({ id: neighbourhoods.id })
      .from(neighbourhoods)
      .where(and(eq(neighbourhoods.districtId, k.id), eq(neighbourhoods.name, 'Caferağa Mahallesi')));
    kadikoy = k.id;
    besiktas = b.id;
    moda = m.id;
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => ({
    get: (p: string) => ctx.http().get(`/api/v1${p}`).set(bearer(s.accessToken)),
    post: (p: string, body: object = {}) => ctx.http().post(`/api/v1${p}`).set(bearer(s.accessToken)).send(body),
    patch: (p: string, body: object) => ctx.http().patch(`/api/v1${p}`).set(bearer(s.accessToken)).send(body),
    put: (p: string, body: object) => ctx.http().put(`/api/v1${p}`).set(bearer(s.accessToken)).send(body),
    del: (p: string) => ctx.http().delete(`/api/v1${p}`).set(bearer(s.accessToken)),
    upload: (p: string, buf: Buffer, name: string) =>
      ctx.http().post(`/api/v1${p}`).set(bearer(s.accessToken)).attach('file', buf, name),
  });

  const listing = (over: object = {}) => ({
    dealType: 'sale',
    category: 'apartment',
    title: 'Moda sahile yürüme mesafesinde 3+1',
    price: 12_500_000,
    grossM2: 145,
    netM2: 120,
    rooms: '3+1',
    cityCode: '34',
    districtId: kadikoy,
    neighbourhoodId: moda,
    cobrokeShare: 50,
    propertyNumber: '123456789',
    ...over,
  });

  /** Fotoğraflı, EİDS onaylı, yayında bir ilan */
  async function published(owner: LoggedIn, over: object = {}) {
    const c = await api(owner).post('/listings', listing(over)).expect(201);
    await api(owner).upload(`/listings/${c.body.id}/photos`, JPEG, 'salon.jpg').expect(201);
    await api(owner).post(`/listings/${c.body.id}/eids-verify`).expect(200);
    await api(owner).post(`/listings/${c.body.id}/publish`).expect(200);
    return c.body.id as string;
  }

  it('konum verisi oturum açmadan listelenir', async () => {
    const citiesRes = await ctx.http().get('/api/v1/locations/cities').expect(200);
    expect(citiesRes.body).toHaveLength(81);
    expect(citiesRes.body.find((c: { code: string }) => c.code === '34').name).toBe('İstanbul');
    const ds = await ctx.http().get('/api/v1/locations/cities/34/districts').expect(200);
    expect(ds.body.map((d: { name: string }) => d.name)).toContain('Kadıköy');
    const ns = await ctx.http().get(`/api/v1/locations/districts/${kadikoy}/neighbourhoods`).expect(200);
    expect(ns.body.map((n: { name: string }) => n.name)).toContain('Caferağa Mahallesi');
  });

  it('yalnızca onaylı danışman ilan ekler; konum tutarlılığı denetlenir', async () => {
    const consumer = await login(ctx, '05321110009');
    await api(consumer)
      .post('/me/onboarding', { fullName: 'Mülk Sahibi', accountType: 'consumer', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    await api(consumer).post('/listings', listing()).expect(403);

    const draftAgent = await login(ctx, '05321110008');
    await api(draftAgent)
      .post('/me/onboarding', { fullName: 'Taslak', accountType: 'agent', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    expect((await api(draftAgent).post('/listings', listing()).expect(403)).body.code).toBe('NOT_VERIFIED');

    const agent = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    expect((await api(agent).post('/listings', listing({ cityCode: '06' })).expect(400)).body.code).toBe('LOCATION_INVALID');
    expect(
      (await api(agent).post('/listings', listing({ districtId: besiktas })).expect(400)).body.code,
    ).toBe('LOCATION_INVALID');
    await api(agent).post('/listings', listing({ rooms: 'üç artı bir' })).expect(400);

    const created = await api(agent).post('/listings', listing()).expect(201);
    expect(created.body).toMatchObject({
      status: 'draft',
      categoryLabel: 'Daire',
      location: { city: 'İstanbul', district: 'Kadıköy', neighbourhood: 'Caferağa Mahallesi' },
      eids: { verified: false, status: 'unverified', propertyNumber: '123456789' },
      isOwner: true,
    });
  });

  it('fotoğraf, EİDS ve yayın kuralları', async () => {
    const agent = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const { body } = await api(agent).post('/listings', listing({ propertyNumber: '111110000' })).expect(201);
    const id = body.id;

    // Fotoğrafsız ve EİDS'siz yayınlanamaz
    const noPhoto = await api(agent).post(`/listings/${id}/publish`).expect(400);
    expect(noPhoto.body).toMatchObject({ code: 'NOT_PUBLISHABLE', missing: ['photo', 'eids'] });

    // PDF fotoğraf olarak kabul edilmez
    expect((await api(agent).upload(`/listings/${id}/photos`, PDF, 'x.jpg').expect(400)).body.code).toBe('FILE_TYPE');
    await api(agent).upload(`/listings/${id}/photos`, JPEG, '1.jpg').expect(201);
    const two = await api(agent).upload(`/listings/${id}/photos`, JPEG, '2.jpg').expect(201);
    const [p1, p2] = two.body.photos.map((p: { id: string }) => p.id);

    // Sıra değişir: ikinci fotoğraf kapak olur
    const reordered = await api(agent).put(`/listings/${id}/photos/order`, { ids: [p2, p1] }).expect(200);
    expect(reordered.body.photos[0].id).toBe(p2);
    await api(agent).put(`/listings/${id}/photos/order`, { ids: [p2] }).expect(400);

    // EİDS: test sağlayıcısında 0000 ile biten numara reddedilir
    const failed = await api(agent).post(`/listings/${id}/eids-verify`).expect(200);
    expect(failed.body.eids).toMatchObject({ verified: false, status: 'failed' });
    expect((await api(agent).post(`/listings/${id}/publish`).expect(400)).body.missing).toEqual(['eids']);

    // Numara düzeltilir → yeniden doğrulanır → yayın
    await api(agent).patch(`/listings/${id}`, { propertyNumber: '111112222' }).expect(200);
    const verified = await api(agent).post(`/listings/${id}/eids-verify`).expect(200);
    expect(verified.body.eids).toMatchObject({ verified: true, status: 'verified' });
    const live = await api(agent).post(`/listings/${id}/publish`).expect(200);
    expect(live.body.status).toBe('active');
    expect(live.body.publishedAt).toBeTruthy();

    // Doğrulanmış numara değiştirilemez
    expect(
      (await api(agent).patch(`/listings/${id}`, { propertyNumber: '999999999' }).expect(409)).body.code,
    ).toBe('EIDS_LOCKED');

    // Fiyat güncellemesi yayını bozmaz
    const updated = await api(agent).patch(`/listings/${id}`, { price: 12_000_000 }).expect(200);
    expect(updated.body).toMatchObject({ status: 'active', price: 12_000_000 });

    // Yayındaki ilan silinemez; pasife alınır, sonra satıldı
    expect((await api(agent).del(`/listings/${id}`).expect(409)).body.code).toBe('NOT_DRAFT');
    expect((await api(agent).post(`/listings/${id}/deactivate`).expect(200)).body.status).toBe('passive');
    expect((await api(agent).post(`/listings/${id}/sold`).expect(200)).body.status).toBe('sold');
    await api(agent).patch(`/listings/${id}`, { price: 1 }).expect(409);
  });

  it('deneme ilanı EİDS olmadan yayınlanabilir ve etiketlidir', async () => {
    const agent = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const { body } = await api(agent).post('/listings', listing({ isDemo: true, propertyNumber: undefined })).expect(201);
    await api(agent).upload(`/listings/${body.id}/photos`, JPEG, '1.jpg').expect(201);
    const live = await api(agent).post(`/listings/${body.id}/publish`).expect(200);
    expect(live.body).toMatchObject({ status: 'active', isDemo: true, eids: { verified: false } });
  });

  it('görünürlük: herkes, yalnızca danışmanlar, ağım; mülk sahibi komisyonu görmez', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const follower = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const stranger = await approvedAgent(ctx, '05321110003', 'Zeynep Kaya');
    const consumer = await login(ctx, '05321110009');
    await api(consumer)
      .post('/me/onboarding', { fullName: 'Mülk Sahibi', accountType: 'consumer', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    await ctx.db.insert(follows).values({ followerId: follower.userId, followeeId: owner.userId });

    const pub = await published(owner, { visibility: 'public' });
    const agentsOnly = await published(owner, { visibility: 'agents', propertyNumber: '22222222' });
    const network = await published(owner, { visibility: 'network', propertyNumber: '33333333' });
    const draft = (await api(owner).post('/listings', listing({ propertyNumber: '44444444' })).expect(201)).body.id;

    // Mülk sahibi: yalnızca herkese açık, komisyon gizli
    const seen = await api(consumer).get(`/listings/${pub}`).expect(200);
    expect(seen.body.cobrokeShare).toBeNull();
    expect(seen.body.eids).toEqual({ verified: true });
    await api(consumer).get(`/listings/${agentsOnly}`).expect(404);
    await api(consumer).get(`/listings/${network}`).expect(404);

    // Danışman: herkese açık ve danışmanlara özel görünür; ağım yalnızca takipçiye
    expect((await api(stranger).get(`/listings/${agentsOnly}`).expect(200)).body.cobrokeShare).toBe(50);
    await api(stranger).get(`/listings/${network}`).expect(404);
    await api(follower).get(`/listings/${network}`).expect(200);

    // Taslak sahibinden başkasına görünmez; fotoğrafı da
    await api(follower).get(`/listings/${draft}`).expect(404);
    const photoPath = (await api(owner).get(`/listings/${network}`)).body.photos[0].url;
    await api(stranger).get(photoPath).expect(404);
    await api(follower).get(photoPath).expect(200).expect('content-type', /image\/jpeg/);

    // Yönetici her ilanı görür
    const admin = await loginAsAdmin(ctx);
    await api(admin).get(`/listings/${draft}`).expect(200);
  });

  it('portföylerim duruma göre listelenir ve sayılır', async () => {
    const agent = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    await published(agent);
    await published(agent, { dealType: 'rent', price: 45_000, propertyNumber: '55555555' });
    await api(agent).post('/listings', listing({ propertyNumber: '66666666' })).expect(201);

    const all = await api(agent).get('/listings/mine').expect(200);
    expect(all.body.counts).toMatchObject({ active: 2, draft: 1, sale: 2, rent: 1 });
    expect(all.body.items).toHaveLength(3);
    expect(all.body.items[0]).toHaveProperty('coverPhoto');

    const active = await api(agent).get('/listings/mine?status=active&dealType=rent').expect(200);
    expect(active.body.items).toHaveLength(1);
    expect(active.body.items[0]).toMatchObject({ dealType: 'rent', price: 45_000, cobrokeShare: 50 });

    const other = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    expect((await api(other).get('/listings/mine').expect(200)).body.items).toHaveLength(0);
  });
});
