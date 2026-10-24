import { eq } from 'drizzle-orm';
import { invoices, paymentRequests } from '../src/db/schema.js';
import { sign } from '../src/payments/provider.js';
import { approvedAgent, createTestApp, login, resetDb, type LoggedIn, type TestContext } from './helpers.js';
import { client, publishListing } from './listing-helpers.js';

const IBAN = 'TR33 0006 1005 1978 6457 8413 26';
const TCKN = '10000000146';
const SECRET = 'dev-payment-webhook-secret';

describe('E8 — ödeme', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(() => resetDb(ctx));
  afterAll(() => ctx.app.close());

  const api = (s: LoggedIn) => client(ctx, s);
  const pub = () => ({
    get: (p: string) => ctx.http().get(`/api/v1${p}`),
    post: (p: string, body: object = {}) => ctx.http().post(`/api/v1${p}`).send(body),
  });
  const tokenOf = (link: string) => link.split('/odeme/')[1]!;

  async function seller() {
    const s = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    await api(s).put('/me/payout-account', { holderName: 'Ayşe Yılmaz', iban: IBAN, taxId: TCKN }).expect(200);
    return s;
  }

  it('IBAN hesabı: doğrulama, maskeleme; hesapsız talep açılamaz', async () => {
    const s = await approvedAgent(ctx, '05321110001', 'Ayşe Yılmaz');
    await api(s).post('/payments/requests', { amount: 1_000_000, description: 'Komisyon', payerName: 'Can' }).expect(400);
    await api(s).put('/me/payout-account', { holderName: 'Ayşe', iban: 'TR330006100519786457841327', taxId: TCKN }).expect(400);
    await api(s).put('/me/payout-account', { holderName: 'Ayşe', iban: IBAN, taxId: '10000000147' }).expect(400);
    const ok = await api(s).put('/me/payout-account', { holderName: 'Ayşe Yılmaz', iban: IBAN, taxId: TCKN }).expect(200);
    expect(ok.body.account).toEqual({
      holderName: 'Ayşe Yılmaz',
      iban: 'TR33 **** **** **** **** 1326',
      taxIdLast4: '0146',
      status: 'verified',
      updatedAt: expect.any(String),
    });
    // Mülk sahibi ödeme uçlarını kullanamaz
    const c = await login(ctx, '05321110009');
    await api(c).post('/me/onboarding', { fullName: 'Can', accountType: 'consumer', kvkkClarification: true, termsOfUse: true }).expect(201);
    await api(c).get('/me/payout-account').expect(403);
  });

  it('paylaşımlı talep → herkese açık sayfa → ödeme → bölüşüm, fatura, bildirim', async () => {
    const s = await seller();
    const buyer = await approvedAgent(ctx, '05321110002', 'Mehmet Demir');
    const listing = await publishListing(ctx, s, { cobrokeShare: 40 });

    const r = await api(s)
      .post('/payments/requests', {
        amount: 10_000_000, // 100.000 TL
        description: 'Moda 3+1 satış komisyonu',
        payerName: 'Can Alıcı',
        payerPhone: '05551112233',
        listingId: listing,
        buyerAgentId: buyer.userId,
      })
      .expect(201);
    // %5 platform → 5.000 TL; kalan 95.000 TL'nin %40'ı alıcı danışmana
    expect(r.body).toMatchObject({
      status: 'open',
      role: 'seller',
      buyerShare: 40,
      breakdown: { platformFee: 500_000, seller: 5_700_000, buyer: 3_800_000, platformFeeBps: 500 },
      myShare: 5_700_000,
      payer: { name: 'Can Alıcı', phone: '05551112233' },
    });
    const token = tokenOf(r.body.link);

    // Alıcı danışman talebi görür, ödeyen iletişimini görmez
    const asBuyer = await api(buyer).get(`/payments/requests/${r.body.id}`).expect(200);
    expect(asBuyer.body).toMatchObject({ role: 'buyer', myShare: 3_800_000, payer: { name: 'Can Alıcı' }, link: null });
    expect(asBuyer.body.payer.phone).toBeUndefined();
    const stranger = await approvedAgent(ctx, '05321110003', 'Zeynep');
    await api(stranger).get(`/payments/requests/${r.body.id}`).expect(404);

    // Herkese açık sayfa (oturumsuz)
    const page = await pub().get(`/pay/${token}`).expect(200);
    expect(page.body).toMatchObject({
      status: 'open',
      amount: 10_000_000,
      description: 'Moda 3+1 satış komisyonu',
      payee: { fullName: 'Ayşe Yılmaz', isVerified: true, officeName: null },
    });
    await pub().get('/pay/yok-boyle-bir-baglanti-1234567').expect(404);

    const co = await pub().post(`/pay/${token}/checkout`).expect(200);
    expect(co.body.redirectUrl).toContain(`/odeme/${token}?oturum=`);

    // Başarısız deneme durumu değiştirmez
    const fail = await pub().post(`/pay/${token}/mock-complete`, { sessionId: co.body.sessionId, outcome: 'fail' }).expect(200);
    expect(fail.body.outcome).toBe('failed');
    expect((await pub().get(`/pay/${token}`)).body.status).toBe('open');

    const ok = await pub().post(`/pay/${token}/mock-complete`, { sessionId: co.body.sessionId, outcome: 'success' }).expect(200);
    expect(ok.body.outcome).toBe('paid');

    const paid = await api(s).get(`/payments/requests/${r.body.id}`).expect(200);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.payouts).toEqual(
      expect.arrayContaining([
        { kind: 'platform', amount: 500_000, payoutStatus: 'settled' },
        { kind: 'seller_agent', amount: 5_700_000, payoutStatus: 'settled' },
        // Alıcı danışmanın hesabı yok → bekletilir
        { kind: 'buyer_agent', amount: 3_800_000, payoutStatus: 'held' },
      ]),
    );

    const [inv] = await ctx.db.select().from(invoices).where(eq(invoices.requestId, r.body.id));
    expect(inv).toMatchObject({ userId: s.userId, total: 500_000, net: 416_667, vat: 83_333, status: 'pending' });

    const notes = (await api(buyer).get('/notifications').expect(200)).body.items.map((n: { type: string }) => n.type);
    expect(notes).toEqual(expect.arrayContaining(['payment.request_created', 'payment.paid']));

    expect((await api(buyer).get('/payments/summary').expect(200)).body).toMatchObject({ held: 3_800_000, settled: 0 });
    // Hesap eklenince bekleyen pay aktarılır
    await api(buyer).put('/me/payout-account', { holderName: 'Mehmet Demir', iban: IBAN, taxId: TCKN }).expect(200);
    expect((await api(buyer).get('/payments/summary').expect(200)).body).toMatchObject({ held: 0, settled: 3_800_000 });
    expect((await api(s).get('/payments/summary').expect(200)).body).toMatchObject({ settled: 5_700_000 });

    // Ödenmiş bağlantı tekrar ödenemez
    await pub().post(`/pay/${token}/checkout`).expect(409);
  });

  it('webhook: imza zorunlu, aynı olay bir kez işlenir', async () => {
    const s = await seller();
    const r = await api(s).post('/payments/requests', { amount: 250_000, description: 'Kira komisyonu', payerName: 'Ece' }).expect(201);
    const token = tokenOf(r.body.link);
    const co = await pub().post(`/pay/${token}/checkout`).expect(200);

    const body = JSON.stringify({ id: 'evt_test_1', type: 'payment.succeeded', sessionId: co.body.sessionId, paymentId: 'pay_1' });
    const send = (sig: string) =>
      ctx.http().post('/api/v1/payments/webhook/mock').set('content-type', 'application/json').set('x-emlook-signature', sig).send(body);

    await send('sha256=bozuk').expect(401);
    await send(sign('baska-sir', body)).expect(401);
    expect((await send(sign(SECRET, body)).expect(200)).body.outcome).toBe('paid');
    expect((await send(sign(SECRET, body)).expect(200)).body.outcome).toBe('duplicate');
    await ctx.http().post('/api/v1/payments/webhook/stripe').send(body).expect(404);

    const d = await api(s).get(`/payments/requests/${r.body.id}`).expect(200);
    expect(d.body).toMatchObject({ status: 'paid', breakdown: { platformFee: 12_500, seller: 237_500, buyer: 0 } });
    expect(d.body.payouts).toHaveLength(2);
  });

  it('iptal ve süre dolumu', async () => {
    const s = await seller();
    const a = await api(s).post('/payments/requests', { amount: 100_000, description: 'Deneme 1', payerName: 'Ali' }).expect(201);
    const b = await api(s).post('/payments/requests', { amount: 100_000, description: 'Deneme 2', payerName: 'Veli' }).expect(201);

    const c = await api(s).post(`/payments/requests/${a.body.id}/cancel`).expect(200);
    expect(c.body.status).toBe('cancelled');
    await api(s).post(`/payments/requests/${a.body.id}/cancel`).expect(409);
    await pub().post(`/pay/${tokenOf(a.body.link)}/checkout`).expect(409);

    await ctx.db.update(paymentRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(paymentRequests.id, b.body.id));
    expect((await pub().get(`/pay/${tokenOf(b.body.link)}`).expect(200)).body.status).toBe('expired');
    const open = await api(s).get('/payments/requests?status=open').expect(200);
    expect(open.body).toHaveLength(0);
    expect((await api(s).get('/payments/requests').expect(200)).body).toHaveLength(2);

    // Alıcı danışman payı için danışman şart; kendini seçemez
    await api(s).post('/payments/requests', { amount: 100_000, description: 'x pay', payerName: 'Zeki', buyerShare: 30 }).expect(400);
    await api(s).post('/payments/requests', { amount: 100_000, description: 'x pay', payerName: 'Zeki', buyerAgentId: s.userId }).expect(400);
  });
});
