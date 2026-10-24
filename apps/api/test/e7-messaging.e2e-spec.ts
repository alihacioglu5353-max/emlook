import { MemoryPushProvider, PushProvider, PushService } from '../src/push/push.service.js';
import { approvedAgent, createTestApp, login, resetDb, type LoggedIn, type TestContext } from './helpers.js';
import { client, publishListing } from './listing-helpers.js';

describe('E7 — mesajlaşma ve push', () => {
  let ctx: TestContext;
  let push: MemoryPushProvider;
  let pushService: PushService;
  beforeAll(async () => {
    ctx = await createTestApp();
    push = ctx.app.get(PushProvider) as MemoryPushProvider;
    pushService = ctx.app.get(PushService);
  });
  beforeEach(async () => {
    await resetDb(ctx);
    push.sent.length = 0;
  });
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => client(ctx, s);

  async function consumer(phone: string, name = 'Can Alıcı') {
    const s = await login(ctx, phone);
    await api(s)
      .post('/me/onboarding', { fullName: name, accountType: 'consumer', kvkkClarification: true, termsOfUse: true })
      .expect(201);
    return s;
  }

  it('danışmanlar arası konuşma: ilan kartı, mesaj, okunmamış, push', async () => {
    const ayse = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const mehmet = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const listing = await publishListing(ctx, ayse, { title: 'Moda 3+1' });
    await api(mehmet).post('/me/devices', { token: 'fcm-token-mehmet-1', platform: 'android' }).expect(204);
    await api(ayse).post('/me/devices', { token: 'fcm-token-ayse-1', platform: 'ios' }).expect(204);

    const c = await api(mehmet)
      .post('/conversations', { userId: ayse.userId, listingId: listing, text: 'Merhaba, bu ilan için alıcım var.' })
      .expect(201);
    expect(c.body).toMatchObject({
      other: { id: ayse.userId, fullName: 'Ayşe Yılmaz', isAgent: true, isVerified: true },
      lastMessage: { body: 'Merhaba, bu ilan için alıcım var.', kind: 'text', mine: true },
      unread: 0,
    });
    // Aynı çift için ikinci başlatma aynı konuşma
    const again = await api(mehmet).post('/conversations', { userId: ayse.userId }).expect(201);
    expect(again.body.id).toBe(c.body.id);

    await pushService.flush();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      tokens: ['fcm-token-ayse-1'],
      payload: { title: 'Mehmet Demir', body: 'Merhaba, bu ilan için alıcım var.', data: { type: 'message', conversationId: c.body.id } },
    });

    expect((await api(ayse).get('/conversations/unread').expect(200)).body).toEqual({ conversations: 1, messages: 2 });
    const list = await api(ayse).get('/conversations').expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: c.body.id, unread: 2, other: expect.objectContaining({ id: mehmet.userId }) })]);

    const msgs = await api(ayse).get(`/conversations/${c.body.id}/messages`).expect(200);
    expect(msgs.body.items.map((m: { kind: string }) => m.kind)).toEqual(['listing', 'text']);
    expect(msgs.body.items[0].listing).toMatchObject({ id: listing, title: 'Moda 3+1', price: 5_000_000 });
    expect(msgs.body.items[0].listing.coverPhoto).toMatch(/^\/listings\//);

    await api(ayse).post(`/conversations/${c.body.id}/read`).expect(200);
    expect((await api(ayse).get('/conversations/unread').expect(200)).body.conversations).toBe(0);

    // Yanıt + yoklama (after)
    const last = msgs.body.items.at(-1).cursor;
    await api(ayse).post(`/conversations/${c.body.id}/messages`, { text: 'Tabii, yarın gösterebilirim.' }).expect(201);
    const fresh = await api(mehmet).get(`/conversations/${c.body.id}/messages?after=${last}`).expect(200);
    expect(fresh.body.items.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ['Tabii, yarın gösterebilirim.', false],
    ]);

    await api(ayse).post(`/conversations/${c.body.id}/messages`, {}).expect(400);
    const stranger = await approvedAgent(ctx, '05321110003', 'Zeynep Kaya');
    await api(stranger).get(`/conversations/${c.body.id}/messages`).expect(404);
    await api(stranger).post(`/conversations/${c.body.id}/messages`, { text: 'selam' }).expect(404);
  });

  it('sayfalama: eskiye doğru imleç', async () => {
    const a = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const b = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const c = await api(a).post('/conversations', { userId: b.userId, text: 'm1' }).expect(201);
    for (let i = 2; i <= 5; i++) {
      await api(i % 2 ? a : b).post(`/conversations/${c.body.id}/messages`, { text: `m${i}` }).expect(201);
    }
    const p1 = await api(a).get(`/conversations/${c.body.id}/messages?limit=3`).expect(200);
    expect(p1.body.items.map((m: { body: string }) => m.body)).toEqual(['m3', 'm4', 'm5']);
    const p2 = await api(a).get(`/conversations/${c.body.id}/messages?limit=3&cursor=${p1.body.nextCursor}`).expect(200);
    expect(p2.body.items.map((m: { body: string }) => m.body)).toEqual(['m1', 'm2']);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('kim kime yazabilir: mülk sahibi danışmana yazar; danışman ilgi göstermemiş mülk sahibine yazamaz', async () => {
    const agent = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const owner = await consumer('05321110009');
    const other = await consumer('05321110008', 'Ece');

    await api(agent).post('/conversations', { userId: owner.userId, text: 'selam' }).expect(403);
    await api(owner).post('/conversations', { userId: other.userId, text: 'selam' }).expect(403);
    await api(owner).post('/conversations', { userId: owner.userId, text: 'selam' }).expect(400);

    // Mülk sahibi ilgi gösterince danışman yazabilir
    const listing = await publishListing(ctx, agent, { visibility: 'public' });
    await api(owner).post(`/listings/${listing}/interest`, {}).expect(200);
    await api(agent).post('/conversations', { userId: owner.userId, text: 'Merhaba, ne zaman uygunsunuz?' }).expect(201);

    // Herkese açık olmayan ilan mülk sahibine paylaşılamaz (gönderenin görmesi yeter, alıcı kartı göremez)
    const hidden = await publishListing(ctx, agent, { visibility: 'agents' });
    const c = await api(agent).get(`/conversations/with/${owner.userId}`).expect(200);
    await api(agent).post(`/conversations/${c.body.conversation.id}/messages`, { listingId: hidden }).expect(201);
    const seen = await api(owner).get(`/conversations/${c.body.conversation.id}/messages`).expect(200);
    expect(seen.body.items.at(-1)).toMatchObject({ kind: 'listing', listing: null });
  });

  it('eşleşme konuşmayı açar; bildirim push olarak da gider; geçersiz belirteç silinir', async () => {
    const owner = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    const buyer = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    await api(owner).post('/me/devices', { token: 'invalid-old-token', platform: 'android' }).expect(204);
    await api(owner).post('/me/devices', { token: 'fcm-token-owner-ok', platform: 'android' }).expect(204);
    const id = await publishListing(ctx, owner, { title: 'Kalamış 2+1' });

    const i = await api(buyer).post(`/listings/${id}/interest`, {}).expect(200);
    await pushService.flush();
    expect(push.sent.at(-1)).toMatchObject({
      tokens: expect.arrayContaining(['invalid-old-token', 'fcm-token-owner-ok']),
      payload: { title: 'Danışman ilgisi', data: { type: 'interest.received' } },
    });

    const acc = await api(owner).post(`/interests/${i.body.id}/accept`).expect(200);
    expect(acc.body.conversationId).toEqual(expect.any(String));
    const msgs = await api(buyer).get(`/conversations/${acc.body.conversationId}/messages`).expect(200);
    expect(msgs.body.items).toEqual([
      expect.objectContaining({ kind: 'system', senderId: null, body: expect.stringContaining('Kalamış 2+1'), listing: expect.objectContaining({ id }) }),
    ]);

    // Geçersiz belirteç bir sonraki gönderimde tek başına kalır
    push.sent.length = 0;
    await api(buyer).post(`/conversations/${acc.body.conversationId}/messages`, { text: 'Teşekkürler!' }).expect(201);
    await pushService.flush();
    expect(push.sent[0].tokens).toEqual(['fcm-token-owner-ok']);

    // Çıkışta cihaz silinir
    await api(owner).del('/me/devices/fcm-token-owner-ok').expect(204);
    push.sent.length = 0;
    await api(buyer).post(`/conversations/${acc.body.conversationId}/messages`, { text: 'Görüşürüz' }).expect(201);
    await pushService.flush();
    expect(push.sent).toHaveLength(0);
  });
});
