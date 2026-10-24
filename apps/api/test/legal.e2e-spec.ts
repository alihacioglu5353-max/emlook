import { createTestApp, type TestContext } from './helpers.js';

describe('Hukuki metinler', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());

  it('oturum açmadan listelenir ve okunur; sürüm rıza kayıtlarıyla aynıdır', async () => {
    const list = await ctx.http().get('/api/v1/legal').expect(200);
    expect(list.body.map((d: { slug: string }) => d.slug)).toEqual(['kvkk', 'kosullar', 'ticari-ileti']);
    expect(list.body[0]).not.toHaveProperty('body');

    const kvkk = await ctx.http().get('/api/v1/legal/kvkk').expect(200);
    expect(kvkk.body).toMatchObject({ title: 'KVKK Aydınlatma Metni', version: '2026-11' });
    expect(kvkk.body.body).toContain('Kanun\'un 11. maddesi');
    // Aydınlatma metni "kabul" istemez (KVKK 2026/347 İlke Kararı)
    expect(kvkk.body.body).not.toMatch(/okudum ve kabul ediyorum|açık rıza veriyorum/i);

    await ctx.http().get('/api/v1/legal/yok').expect(404);
  });
});
