import { and, eq } from 'drizzle-orm';
import { officeMemberships } from '../src/db/schema.js';
import {
  approvedAgent,
  bearer,
  createTestApp,
  login,
  loginAsAdmin,
  resetDb,
  type LoggedIn,
  type TestContext,
} from './helpers.js';

const OFFICE = {
  name: 'Yılmaz Gayrimenkul Kadıköy',
  legalName: 'Yılmaz Gayrimenkul Ltd. Şti.',
  licenseNumber: '3401111',
  city: 'İstanbul',
  district: 'Kadıköy',
  phone: '0216 123 45 67',
};

describe('E2 — ofis hesabı, ekip ve transfer', () => {
  let ctx: TestContext;
  let admin: LoggedIn;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    admin = await loginAsAdmin(ctx);
  });
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => ({
    get: (p: string) => ctx.http().get(`/api/v1${p}`).set(bearer(s.accessToken)),
    post: (p: string, body: object = {}) =>
      ctx.http().post(`/api/v1${p}`).set(bearer(s.accessToken)).send(body),
    patch: (p: string, body: object) =>
      ctx.http().patch(`/api/v1${p}`).set(bearer(s.accessToken)).send(body),
    del: (p: string) => ctx.http().delete(`/api/v1${p}`).set(bearer(s.accessToken)),
  });

  /** Ofis açar ve yöneticiye onaylatır. */
  async function activeOffice(owner: LoggedIn, overrides: Partial<typeof OFFICE> = {}) {
    const res = await api(owner).post('/offices', { ...OFFICE, ...overrides }).expect(201);
    await api(admin).post(`/admin/offices/${res.body.id}/approve`).expect(200);
    return res.body.id as string;
  }

  const notificationTypes = async (s: LoggedIn) =>
    (await api(s).get('/notifications').expect(200)).body.items.map(
      (n: { type: string }) => n.type,
    );

  it('onaylanmamış danışman ofis açamaz', async () => {
    const s = await login(ctx, '05321110001');
    await api(s)
      .post('/me/onboarding', {
        fullName: 'Taslak Danışman',
        accountType: 'agent',
        kvkkClarification: true,
        termsOfUse: true,
      })
      .expect(201);
    const res = await api(s).post('/offices', OFFICE).expect(403);
    expect(res.body.code).toBe('NOT_VERIFIED');
  });

  it('ofis açılır, yönetici onayına kadar görünmez; onaylanınca sahip rozetiyle yayına girer', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const created = await api(owner).post('/offices', OFFICE).expect(201);
    expect(created.body.membership).toMatchObject({ role: 'owner', office: { status: 'pending' } });
    expect(created.body.independent).toBe(true);
    const officeId = created.body.id;

    // İkinci ofis açılamaz
    expect((await api(owner).post('/offices', OFFICE).expect(409)).body.code).toBe(
      'ALREADY_IN_OFFICE',
    );

    // Bekleyen ofis aramada çıkmaz, katılma talebi alamaz
    const other = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    expect((await api(other).get('/offices?q=Yılmaz').expect(200)).body).toHaveLength(0);
    expect(
      (await api(other).post(`/offices/${officeId}/join-requests`).expect(409)).body.code,
    ).toBe('OFFICE_NOT_ACTIVE');
    await api(other).get(`/offices/${officeId}`).expect(404);

    // Yönetici incelemesi
    const counts = await api(admin).get('/admin/offices/counts').expect(200);
    expect(counts.body.pending).toBe(1);
    const detail = await api(admin).get(`/admin/offices/${officeId}`).expect(200);
    expect(detail.body.owner).toMatchObject({ fullName: 'Ayşe Yılmaz', verificationStatus: 'approved' });
    expect(detail.body.owner.licenseMatches).toBe(false);
    await api(owner).get('/admin/offices').expect(403);

    await api(admin).post(`/admin/offices/${officeId}/approve`).expect(200);
    await api(admin).post(`/admin/offices/${officeId}/approve`).expect(409);
    expect(await notificationTypes(owner)).toContain('office.approved');

    const found = await api(other).get('/offices?q=yılmaz').expect(200);
    expect(found.body).toEqual([
      expect.objectContaining({ id: officeId, name: OFFICE.name, memberCount: 1 }),
    ]);
    const card = await api(other).get(`/agents/${owner.userId}`).expect(200);
    expect(card.body).toMatchObject({
      office: { id: officeId, name: OFFICE.name, role: 'owner' },
      independent: false,
    });
    const me = await api(owner).get('/me').expect(200);
    expect(me.body.office).toMatchObject({ id: officeId, role: 'owner', status: 'active' });
  });

  it('katılma talebi ve davet akışları, yetki kontrolleriyle çalışır', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const officeId = await activeOffice(owner);
    const b = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const c = await approvedAgent(ctx, '05321110003', 'Zeynep Kaya');

    // B katılma talebi gönderir
    const req = await api(b).post(`/offices/${officeId}/join-requests`).expect(201);
    expect(req.body.requests).toHaveLength(1);
    expect(
      (await api(b).post(`/offices/${officeId}/join-requests`).expect(409)).body.code,
    ).toBe('ALREADY_PENDING');
    expect(await notificationTypes(owner)).toContain('office.join_requested');

    // Üye olmayan ofisi yönetemez
    await api(b).get(`/offices/${officeId}/manage`).expect(403);

    const panel = await api(owner).get(`/offices/${officeId}/manage`).expect(200);
    expect(panel.body.myRole).toBe('owner');
    const membershipId = panel.body.requests[0].membershipId;
    const approved = await api(owner)
      .post(`/offices/${officeId}/requests/${membershipId}/approve`)
      .expect(200);
    expect(approved.body.members.map((m: { fullName: string }) => m.fullName).sort()).toEqual([
      'Ayşe Yılmaz',
      'Mehmet Demir',
    ]);
    expect(await notificationTypes(b)).toContain('office.request_approved');
    expect((await api(b).get('/me/office').expect(200)).body.membership.role).toBe('agent');

    // Davet: geçersiz numara, kayıtsız numara, onaylı danışman
    expect(
      (await api(owner).post(`/offices/${officeId}/invitations`, { phone: '0212 111 11 11' }).expect(400))
        .body.code,
    ).toBe('PHONE_INVALID');
    expect(
      (await api(owner).post(`/offices/${officeId}/invitations`, { phone: '0539 000 00 01' }).expect(404))
        .body.code,
    ).toBe('AGENT_NOT_FOUND');
    expect(
      (await api(owner).post(`/offices/${officeId}/invitations`, { phone: '05321110002' }).expect(409))
        .body.code,
    ).toBe('ALREADY_MEMBER');

    await api(owner).post(`/offices/${officeId}/invitations`, { phone: '0532 111 00 03' }).expect(201);
    expect(
      (await api(owner).post(`/offices/${officeId}/invitations`, { phone: '05321110003' }).expect(409))
        .body.code,
    ).toBe('ALREADY_PENDING');

    // Danışman (yönetici değil) davet gönderemez
    await api(b).post(`/offices/${officeId}/invitations`, { phone: '05321110003' }).expect(403);

    const mine = await api(c).get('/me/office').expect(200);
    expect(mine.body.invitations).toEqual([
      expect.objectContaining({ office: expect.objectContaining({ id: officeId }) }),
    ]);
    await api(c).post(`/me/office/invitations/${mine.body.invitations[0].membershipId}/accept`).expect(200);
    expect(await notificationTypes(owner)).toContain('office.invite_accepted');

    const profile = await api(c).get(`/offices/${officeId}`).expect(200);
    expect(profile.body.members.map((m: { role: string }) => m.role)).toEqual([
      'owner',
      'agent',
      'agent',
    ]);
    expect(profile.body.members.every((m: { isVerified: boolean }) => m.isVerified)).toBe(true);
  });

  it('başka ofise geçiş yeni ofisin onayıyla tamamlanır ve eski ofise bildirim gider', async () => {
    const ownerA = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const officeA = await activeOffice(ownerA);
    const ownerD = await approvedAgent(ctx, '05321110004', 'Deniz Ak');
    const officeD = await activeOffice(ownerD, { name: 'Ak Emlak Ataşehir', licenseNumber: '3402222' });

    const b = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    await api(b).post(`/offices/${officeA}/join-requests`).expect(201);
    const reqA = (await api(ownerA).get(`/offices/${officeA}/manage`)).body.requests[0].membershipId;
    await api(ownerA).post(`/offices/${officeA}/requests/${reqA}/approve`).expect(200);

    // B, A'dayken D'ye talep gönderir; D onaylayana kadar A'da kalır
    await api(b).post(`/offices/${officeD}/join-requests`).expect(201);
    expect((await api(b).get('/me/office')).body.membership.office.id).toBe(officeA);

    const reqD = (await api(ownerD).get(`/offices/${officeD}/manage`)).body.requests[0].membershipId;
    await api(ownerD).post(`/offices/${officeD}/requests/${reqD}/approve`).expect(200);

    const after = await api(b).get('/me/office').expect(200);
    expect(after.body.membership.office.id).toBe(officeD);
    const old = await ctx.db
      .select({ status: officeMemberships.status })
      .from(officeMemberships)
      .where(and(eq(officeMemberships.officeId, officeA), eq(officeMemberships.userId, b.userId)));
    expect(old.map((r) => r.status)).toEqual(['left']);
    expect(await notificationTypes(ownerA)).toContain('office.member_transferred');
    expect((await api(ownerA).get(`/offices/${officeA}/manage`)).body.members).toHaveLength(1);
  });

  it('aynı danışmanın iki ofis onayı eşzamanlı gelirse yalnızca biri geçer', async () => {
    const ownerA = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const officeA = await activeOffice(ownerA);
    const ownerD = await approvedAgent(ctx, '05321110004', 'Deniz Ak');
    const officeD = await activeOffice(ownerD, { name: 'Ak Emlak', licenseNumber: '3402222' });
    const b = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    await api(b).post(`/offices/${officeA}/join-requests`).expect(201);
    await api(b).post(`/offices/${officeD}/join-requests`).expect(201);
    const reqA = (await api(ownerA).get(`/offices/${officeA}/manage`)).body.requests[0].membershipId;
    const reqD = (await api(ownerD).get(`/offices/${officeD}/manage`)).body.requests[0].membershipId;

    const results = await Promise.all([
      api(ownerA).post(`/offices/${officeA}/requests/${reqA}/approve`),
      api(ownerD).post(`/offices/${officeD}/requests/${reqD}/approve`),
    ]);
    const statuses = results.map((r) => r.status);
    // İkisi de başarılı olabilir (ikincisi transfer sayılır) ama asla 500 olmaz
    // ve danışmanın tek bir aktif üyeliği kalır.
    expect(statuses.every((s) => s === 200 || s === 404 || s === 409)).toBe(true);
    const active = await ctx.db
      .select()
      .from(officeMemberships)
      .where(and(eq(officeMemberships.userId, b.userId), eq(officeMemberships.status, 'active')));
    expect(active).toHaveLength(1);
  });

  it('roller, çıkarma, ayrılma ve sahiplik devri', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const officeId = await activeOffice(owner);
    const b = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const c = await approvedAgent(ctx, '05321110003', 'Zeynep Kaya');
    for (const phone of ['05321110002', '05321110003']) {
      await api(owner).post(`/offices/${officeId}/invitations`, { phone }).expect(201);
    }
    for (const s of [b, c]) {
      const inv = (await api(s).get('/me/office')).body.invitations[0].membershipId;
      await api(s).post(`/me/office/invitations/${inv}/accept`).expect(200);
    }

    // Sahip ayrılamaz
    expect((await api(owner).post('/me/office/leave').expect(409)).body.code).toBe(
      'OWNER_CANNOT_LEAVE',
    );

    // C yönetici olur; yönetici rol değiştiremez, sahibi çıkaramaz, danışmanı çıkarabilir
    await api(owner).patch(`/offices/${officeId}/members/${c.userId}`, { role: 'manager' }).expect(200);
    expect(await notificationTypes(c)).toContain('office.role_changed');
    await api(c).patch(`/offices/${officeId}/members/${b.userId}`, { role: 'manager' }).expect(403);
    await api(c).del(`/offices/${officeId}/members/${owner.userId}`).expect(409);
    await api(c).del(`/offices/${officeId}/members/${b.userId}`).expect(200);
    expect(await notificationTypes(b)).toContain('office.member_removed');
    expect((await api(b).get('/me/office')).body).toMatchObject({ membership: null, independent: true });
    const card = await api(owner).get(`/agents/${b.userId}`).expect(200);
    expect(card.body).toMatchObject({ office: null, independent: true });

    // Sahiplik devri: eski sahip yönetici olur ve artık ayrılabilir
    await api(owner).post(`/offices/${officeId}/owner/${c.userId}`).expect(200);
    const panel = await api(c).get(`/offices/${officeId}/manage`).expect(200);
    expect(panel.body.myRole).toBe('owner');
    expect(
      panel.body.members.find((m: { userId: string }) => m.userId === owner.userId).role,
    ).toBe('manager');
    await api(owner).post('/me/office/leave').expect(200);
    expect(await notificationTypes(c)).toContain('office.member_left');
  });

  it('reddedilen ofisin sahibi bağımsız kalır ve yeniden başvurabilir', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const res = await api(owner).post('/offices', OFFICE).expect(201);
    await api(admin).post(`/admin/offices/${res.body.id}/reject`).send({}).expect(400);
    await api(admin)
      .post(`/admin/offices/${res.body.id}/reject`, { reason: 'Belge numarası unvanla eşleşmiyor' })
      .expect(200);

    const mine = await api(owner).get('/me/office').expect(200);
    expect(mine.body).toMatchObject({ membership: null, independent: true });
    expect(await notificationTypes(owner)).toContain('office.rejected');
    await api(owner).post('/offices', { ...OFFICE, licenseNumber: '3409999' }).expect(201);
  });

  it('bildirimler listelenir ve okundu işaretlenir', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    await activeOffice(owner);
    await activeOffice(await approvedAgent(ctx, '05321110002', 'Mehmet Demir'), {
      licenseNumber: '3405555',
    });

    const list = await api(owner).get('/notifications').expect(200);
    expect(list.body.unread).toBe(1);
    expect(list.body.items[0]).toMatchObject({ type: 'office.approved', readAt: null });

    const read = await api(owner).post(`/notifications/${list.body.items[0].id}/read`).expect(200);
    expect(read.body.unread).toBe(0);
    expect((await api(owner).get('/notifications/unread-count')).body.unread).toBe(0);
    await api(owner).post('/notifications/read-all').expect(200);
  });
});
