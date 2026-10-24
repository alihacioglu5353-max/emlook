import { and, eq } from 'drizzle-orm';
import { districts } from '../src/db/schema.js';
import { bearer, JPEG, type LoggedIn, type TestContext } from './helpers.js';

/** Oturumlu istek kısayolları */
export function client(ctx: TestContext, s: LoggedIn) {
  return {
    get: (p: string) => ctx.http().get(`/api/v1${p}`).set(bearer(s.accessToken)),
    post: (p: string, body: object = {}) => ctx.http().post(`/api/v1${p}`).set(bearer(s.accessToken)).send(body),
    patch: (p: string, body: object) => ctx.http().patch(`/api/v1${p}`).set(bearer(s.accessToken)).send(body),
    del: (p: string) => ctx.http().delete(`/api/v1${p}`).set(bearer(s.accessToken)),
    upload: (p: string, buf: Buffer, name: string) =>
      ctx.http().post(`/api/v1${p}`).set(bearer(s.accessToken)).attach('file', buf, name),
  };
}

export async function districtId(ctx: TestContext, cityCode: string, name: string) {
  const [row] = await ctx.db
    .select({ id: districts.id })
    .from(districts)
    .where(and(eq(districts.cityCode, cityCode), eq(districts.name, name)));
  return row.id;
}

let seq = 1000;

/** Fotoğraflı, EİDS onaylı, yayında ilan oluşturur */
export async function publishListing(ctx: TestContext, owner: LoggedIn, over: Record<string, unknown> = {}) {
  const api = client(ctx, owner);
  const c = await api
    .post('/listings', {
      dealType: 'sale',
      category: 'apartment',
      title: 'Deneme ilanı başlığı',
      price: 5_000_000,
      rooms: '2+1',
      cityCode: '34',
      districtId: await districtId(ctx, '34', 'Kadıköy'),
      cobrokeShare: 50,
      propertyNumber: String(++seq * 1000 + 1),
      ...over,
    })
    .expect(201);
  await api.upload(`/listings/${c.body.id}/photos`, JPEG, 'foto.jpg').expect(201);
  await api.post(`/listings/${c.body.id}/eids-verify`).expect(200);
  await api.post(`/listings/${c.body.id}/publish`).expect(200);
  return c.body.id as string;
}
