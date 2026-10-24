import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { DB, type Database } from '../src/db/db.module.js';
import { runMigrations } from '../src/db/migrate.js';
import { locationsLoaded, seedLocations } from '../src/db/seed-locations.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { agentProfiles, users } from '../src/db/schema.js';
import { MemorySmsService, SmsService } from '../src/sms/sms.service.js';

export interface TestContext {
  app: INestApplication<App>;
  db: Database;
  sms: MemorySmsService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  await runMigrations(process.env.DATABASE_URL!);
  await ensureLocations(process.env.DATABASE_URL!);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return {
    app,
    db: app.get<Database>(DB),
    sms: app.get(SmsService) as MemorySmsService,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDb(ctx: TestContext): Promise<void> {
  await ctx.db.execute(sql`
    TRUNCATE listing_likes, listing_saves, listing_photos, listings, follows,
             notifications, office_memberships, offices, audit_logs, consents,
             sessions, verification_documents, agent_profiles, otp_codes, users
             RESTART IDENTITY CASCADE
  `);
  ctx.sms.outbox.length = 0;
}

/** SMS kutusundan son kodu okur. */
export function lastCode(ctx: TestContext, e164: string): string {
  const msg = ctx.sms.lastTo(e164);
  const code = msg?.body.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`${e164} için SMS bulunamadı`);
  return code;
}

export interface LoggedIn {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** OTP akışıyla giriş yapar (kullanıcı yoksa oluşturulur). */
export async function login(ctx: TestContext, phone: string): Promise<LoggedIn> {
  await ctx.http().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const e164 = `+90${phone.replace(/\D/g, '').slice(-10)}`;
  const res = await ctx
    .http()
    .post('/api/v1/auth/otp/verify')
    .send({ phone, code: lastCode(ctx, e164) })
    .expect(200);
  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    userId: res.body.user.id,
  };
}

export async function loginAsAdmin(ctx: TestContext, phone = '05399999999') {
  await ctx.db
    .insert(users)
    .values({ phone: `+90${phone.slice(1)}`, role: 'admin', fullName: 'Admin' })
    .onConflictDoNothing();
  return login(ctx, phone);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Geçerli küçük bir PDF içeriği (dosya türü baytlardan anlaşılır). */
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/**
 * Onaylı bir danışman hazırlar (başvuru akışı E1 testlerinde ayrıca denenir;
 * burada onay doğrudan veritabanına yazılır).
 */
export async function approvedAgent(
  ctx: TestContext,
  phone: string,
  fullName: string,
): Promise<LoggedIn> {
  const s = await login(ctx, phone);
  await ctx
    .http()
    .post('/api/v1/me/onboarding')
    .set(bearer(s.accessToken))
    .send({ fullName, accountType: 'agent', kvkkClarification: true, termsOfUse: true })
    .expect(201);
  await ctx.db
    .update(agentProfiles)
    .set({
      verificationStatus: 'approved',
      licenseNumber: '34' + phone.slice(-5),
      businessName: `${fullName} Gayrimenkul`,
      city: 'İstanbul',
      district: 'Kadıköy',
    })
    .where(eq(agentProfiles.userId, s.userId));
  return s;
}

/** Konum verisi test veritabanına bir kez yüklenir (her testte silinmez). */
async function ensureLocations(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    if (!(await locationsLoaded(db))) await seedLocations(db);
  } finally {
    await pool.end();
  }
}

/** Geçerli küçük bir JPEG içeriği (yalnızca imza baytları önemlidir). */
export const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\u0000test-image'),
  Buffer.from([0xff, 0xd9]),
]);
