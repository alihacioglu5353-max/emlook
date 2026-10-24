/**
 * Geliştirme ve demo verisi: `pnpm --filter api db:seed-demo`
 *  - Her kullanıcı türünden hesaplar (0532 000 00 00–09) + ek danışman ve alıcılar
 *  - Ofisler, ilanlar ve fotoğrafları, takip/beğeni/kaydetme, ilgi ve eşleşmeler,
 *    mesajlaşmalar, ödeme talepleri, şikâyetler, bekleyen başvurular, bildirimler
 * Tekrar çalıştırmak güvenlidir: demo kullanıcılarının içeriği silinip yeniden kurulur.
 * Giriş normal OTP akışıyla yapılır; SMS_PROVIDER=console iken kod API konsoluna yazılır.
 * İl/ilçe verisi gerekir (`db:seed-locations`). Üretim veritabanında çalışmaz.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { normalizeForSearch } from '../common/text.js';
import { validateEnv } from '../config/env.js';
import { LEGAL_DOCS } from '../legal/legal.texts.js';
import { splitAmount, vatFromGross } from '../payments/money.js';
import { LocalStorageService, S3StorageService, type StorageService } from '../storage/storage.service.js';
import {
  CHAT_SCRIPTS,
  DEMO_USERS,
  INTERESTS,
  LISTINGS,
  OFFICES,
  PAYMENTS,
  PAYOUT_AGENTS,
  REPORTS,
  type OfficeKey,
} from './demo/data.js';
import {
  agentProfiles,
  auditLogs,
  cities,
  consents,
  conversationParticipants,
  conversations,
  districts,
  follows,
  interests,
  invoices,
  listingLikes,
  listingPhotos,
  listingReports,
  listingSaves,
  listings,
  listingSwipes,
  messages,
  neighbourhoods,
  notifications,
  officeMemberships,
  offices,
  paymentRequests,
  paymentSplits,
  payoutAccounts,
  users,
  verificationDocuments,
} from './schema.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Demo verisi üretimde oluşturulmaz');
  process.exit(1);
}
const env = validateEnv(process.env);

// ---- Yardımcılar ----

/** Tekrarlanabilir sözde rastgele (mulberry32) */
let seed = 20261025;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const sample = <T>(list: readonly T[], n: number) => {
  const copy = [...list];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!);
  return out;
};
const NOW = Date.now();
const DAY = 86_400_000;
/** `days` gün önce, gün içinde rastgele bir saat (iş saatlerine yakın) */
const ago = (days: number, hourJitter = true) =>
  new Date(NOW - days * DAY - (hourJitter ? Math.floor(rand() * 9) * 3_600_000 + Math.floor(rand() * 60) * 60_000 : 0));
const after = (d: Date, minMinutes: number, maxMinutes: number) =>
  new Date(Math.min(NOW - 60_000, d.getTime() + (minMinutes + rand() * (maxMinutes - minMinutes)) * 60_000));

const DEAL_LABEL = { sale: 'Satılık', rent: 'Kiralık' } as const;
const CATEGORY_LABEL = {
  apartment: 'Daire', residence: 'Rezidans', villa: 'Villa', detached_house: 'Müstakil ev', shop: 'Dükkân', office: 'Ofis',
} as const;
const tl = (n: number) => new Intl.NumberFormat('tr-TR').format(n) + ' TL';

/** Geçerli TCKN (algoritmaya uygun, demo) */
function tckn(n: number) {
  const d = String(100000000 + n * 7919).slice(0, 9).split('').map(Number);
  if (d[0] === 0) d[0] = 1;
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return d.join('') + d10 + d11;
}
/** Geçerli TR IBAN (mod 97, demo) */
function iban(n: number) {
  const bban = '00062' + '0' + String(1000000000000000 + n * 104729).slice(-16);
  const numeric = (bban + 'TR00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return 'TR' + String(98 - rem).padStart(2, '0') + bban;
}

/** En küçük geçerli PDF: danışman başvurularındaki örnek yetki belgesi */
function demoPdf(name: string) {
  const text = `Tasinmaz Ticareti Yetki Belgesi (DEMO) - ${name}`.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 60 760 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---- Fotoğraflar (Pexels; önbellek apps/api/demo-photos) ----

const PHOTO_DIR = path.resolve(process.cwd(), 'demo-photos');
let photoWarned = false;
async function photo(id: number): Promise<Buffer | null> {
  for (const f of [path.join(PHOTO_DIR, `${id}.jpg`), path.join(PHOTO_DIR, 'candidates', `${id}.jpg`)]) {
    if (existsSync(f)) return readFile(f);
  }
  try {
    const res = await fetch(`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(PHOTO_DIR, { recursive: true });
    await writeFile(path.join(PHOTO_DIR, `${id}.jpg`), buf);
    return buf;
  } catch {
    if (!photoWarned) console.warn('! Fotoğraflar indirilemedi; ilanlar fotoğrafsız oluşturulacak (demo-photos klasörüne koyabilirsiniz).');
    photoWarned = true;
    return null;
  }
}

// ---- Kurulum ----

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
const db = drizzle(pool);
const storage: StorageService =
  env.STORAGE_DRIVER === 's3' && env.S3 ? new S3StorageService(env.S3) : new LocalStorageService(env.STORAGE_DIR);

try {
  const [{ n: cityCount }] = (await db.select({ n: sql<number>`count(*)::int` }).from(cities));
  if (!cityCount) {
    console.error('İl/ilçe verisi yok. Önce: pnpm --filter api db:seed-locations');
    process.exit(1);
  }

  // ---- 1. Kullanıcılar ----
  const ids = new Map<string, string>();
  const name = new Map<string, string>();
  for (const u of DEMO_USERS) {
    const createdAt = ago(u.days);
    const values = {
      fullName: u.fullName,
      role: u.role,
      status: u.suspended ? ('suspended' as const) : ('active' as const),
      suspendedReason: u.suspended ?? null,
      suspendedAt: u.suspended ? ago(5) : null,
      createdAt,
      lastLoginAt: u.suspended ? ago(6) : ago(Math.min(u.days, Math.floor(rand() * 4))),
    };
    const [row] = await db
      .insert(users)
      .values({ phone: u.phone, ...values })
      .onConflictDoUpdate({ target: users.phone, set: values })
      .returning({ id: users.id });
    ids.set(u.phone, row!.id);
    name.set(row!.id, u.fullName);
  }
  const id = (phone: string) => ids.get(phone)!;
  const demoIds = [...ids.values()];
  const adminId = id(DEMO_USERS[0]!.phone);

  // ---- 2. Önceki demo içeriğini temizle ----
  const oldPhotos = await db
    .select({ key: listingPhotos.storageKey })
    .from(listingPhotos)
    .innerJoin(listings, eq(listings.id, listingPhotos.listingId))
    .where(inArray(listings.ownerId, demoIds));
  const oldDocs = await db
    .select({ key: verificationDocuments.storageKey })
    .from(verificationDocuments)
    .where(inArray(verificationDocuments.userId, demoIds));
  await Promise.all([...oldPhotos, ...oldDocs].map((p) => storage.remove(p.key)));

  const demoRequests = db.select({ id: paymentRequests.id }).from(paymentRequests).where(inArray(paymentRequests.createdBy, demoIds));
  await db.delete(invoices).where(inArray(invoices.requestId, demoRequests));
  await db.delete(paymentRequests).where(inArray(paymentRequests.createdBy, demoIds));
  await db.delete(conversations).where(
    inArray(
      conversations.id,
      db.select({ id: conversationParticipants.conversationId }).from(conversationParticipants).where(inArray(conversationParticipants.userId, demoIds)),
    ),
  );
  await db.delete(listingReports).where(inArray(listingReports.reporterId, demoIds));
  await db.delete(listings).where(inArray(listings.ownerId, demoIds));
  await db.delete(follows).where(or(inArray(follows.followerId, demoIds), inArray(follows.followeeId, demoIds)));
  await db.delete(listingSwipes).where(inArray(listingSwipes.userId, demoIds));
  await db.delete(notifications).where(inArray(notifications.userId, demoIds));
  await db.delete(auditLogs).where(inArray(auditLogs.actorId, demoIds));
  await db.delete(payoutAccounts).where(inArray(payoutAccounts.userId, demoIds));
  await db.delete(verificationDocuments).where(inArray(verificationDocuments.userId, demoIds));
  await db.delete(officeMemberships).where(inArray(officeMemberships.userId, demoIds));
  await db.delete(offices).where(inArray(offices.ownerId, demoIds));

  const audit: (typeof auditLogs.$inferInsert)[] = [];
  const notes: (typeof notifications.$inferInsert)[] = [];
  const notify = (userId: string, type: string, title: string, body: string, data: Record<string, unknown>, at: Date) =>
    notes.push({ userId, type, title, body, data, createdAt: at, readAt: NOW - at.getTime() > 2 * DAY ? after(at, 30, 600) : null });

  // ---- 3. Rızalar, danışman profilleri, belgeler ----
  for (const u of DEMO_USERS) {
    const uid = id(u.phone);
    const created = ago(u.days, false);
    if (u.role !== 'admin') {
      const has = await db.select({ id: consents.id }).from(consents).where(eq(consents.userId, uid)).limit(1);
      if (has.length === 0) {
        await db.insert(consents).values([
          { userId: uid, type: 'kvkk_clarification', version: LEGAL_DOCS.kvkk.version, granted: true, createdAt: created },
          { userId: uid, type: 'terms_of_use', version: LEGAL_DOCS.kosullar.version, granted: true, createdAt: created },
          { userId: uid, type: 'marketing', version: LEGAL_DOCS['ticari-ileti'].version, granted: rand() < 0.4, createdAt: created },
        ]);
      }
    }
    if (!u.agent) continue;
    const a = u.agent;
    const reviewed = a.status === 'approved' || a.status === 'rejected';
    const submittedAt = a.status === 'draft' ? null : new Date(created.getTime() + 3_600_000);
    const reviewedAt = reviewed ? new Date(created.getTime() + DAY) : null;
    const values = {
      verificationStatus: a.status,
      licenseNumber: a.license ?? null,
      businessName: a.businessName ?? null,
      city: a.status === 'draft' ? null : 'İstanbul',
      district: a.status === 'draft' ? null : (a.district ?? 'Kadıköy'),
      bio: a.bio ?? null,
      submittedAt,
      reviewedAt,
      reviewedBy: reviewed ? adminId : null,
      rejectionReason: a.reason ?? null,
    };
    await db.insert(agentProfiles).values({ userId: uid, ...values }).onConflictDoUpdate({ target: agentProfiles.userId, set: values });
    if (a.status !== 'draft') {
      const buf = demoPdf(u.fullName);
      const key = await storage.put(`verification/${uid}`, buf, 'pdf', 'application/pdf');
      await db.insert(verificationDocuments).values({
        userId: uid, type: 'authority_certificate', storageKey: key, originalName: 'yetki-belgesi.pdf',
        mimeType: 'application/pdf', sizeBytes: buf.length, createdAt: submittedAt ?? created,
      });
      audit.push({ actorId: uid, action: 'agent.submitted', targetType: 'user', targetId: uid, createdAt: submittedAt ?? created });
    }
    if (reviewedAt) {
      audit.push({
        actorId: adminId, action: a.status === 'approved' ? 'agent.approved' : 'agent.rejected', targetType: 'user', targetId: uid,
        metadata: a.reason ? { reason: a.reason } : null, createdAt: reviewedAt,
      });
    }
  }
  const suspended = DEMO_USERS.find((u) => u.suspended);
  if (suspended) {
    audit.push({ actorId: adminId, action: 'user.suspended', targetType: 'user', targetId: id(suspended.phone), metadata: { reason: suspended.suspended }, createdAt: ago(5) });
  }

  // ---- 4. Ofisler ve üyelikler ----
  const officeIds = new Map<OfficeKey, string>();
  for (const [key, o] of Object.entries(OFFICES) as [OfficeKey, (typeof OFFICES)[OfficeKey]][]) {
    const owner = DEMO_USERS.find((u) => u.office?.key === key && u.office.role === 'owner')!;
    const created = ago(o.days);
    const [row] = await db
      .insert(offices)
      .values({
        name: o.name, legalName: o.legalName, licenseNumber: o.license, city: 'İstanbul', district: o.district,
        address: o.address, phone: '0216 000 00 00', ownerId: id(owner.phone), status: o.status,
        reviewedAt: o.status === 'active' ? after(created, 60, 600) : null, reviewedBy: o.status === 'active' ? adminId : null,
        createdAt: created,
      })
      .returning({ id: offices.id });
    officeIds.set(key, row!.id);
    if (o.status === 'active') audit.push({ actorId: adminId, action: 'office.approved', targetType: 'office', targetId: row!.id, createdAt: after(created, 60, 600) });
  }
  const officeOf = new Map<string, string>();
  for (const u of DEMO_USERS.filter((x) => x.office)) {
    const officeId = officeIds.get(u.office!.key)!;
    await db.insert(officeMemberships).values({
      officeId, userId: id(u.phone), role: u.office!.role, status: 'active', decidedAt: ago(OFFICES[u.office!.key].days - 1),
    });
    if (OFFICES[u.office!.key].status === 'active') officeOf.set(id(u.phone), officeId);
  }
  // Bekleyen katılma talebi ve davet: ofis ekranları boş kalmasın
  await db.insert(officeMemberships).values([
    { officeId: officeIds.get('yilmaz')!, userId: id('+905320000108'), role: 'agent', status: 'requested', createdAt: ago(1) },
    { officeId: officeIds.get('bogazici')!, userId: id('+905320000107'), role: 'agent', status: 'invited', invitedBy: id('+905320000101'), createdAt: ago(2) },
  ]);

  // ---- 5. İlanlar ve fotoğraflar ----
  const districtRows = await db.select({ id: districts.id, name: districts.name }).from(districts).where(eq(districts.cityCode, '34'));
  const districtId = new Map(districtRows.map((d) => [d.name, d.id]));
  const listingIds: string[] = [];
  const listingMeta: { id: string; owner: string; title: string; publishedAt: Date | null; visibility: string; active: boolean }[] = [];
  let photoCount = 0;

  for (const [i, l] of LISTINGS.entries()) {
    const dId = districtId.get(l.district);
    if (!dId) throw new Error(`İlçe bulunamadı: ${l.district}`);
    let hoodId: number | null = null;
    let hoodName: string | null = null;
    if (l.hood) {
      const [n] = await db
        .select({ id: neighbourhoods.id, name: neighbourhoods.name })
        .from(neighbourhoods)
        .where(and(eq(neighbourhoods.districtId, dId), eq(neighbourhoods.name, `${l.hood} Mahallesi`)));
      hoodId = n?.id ?? null;
      hoodName = n?.name ?? null;
    }
    const ownerId = id(l.owner);
    const status = l.status ?? 'active';
    const published = status === 'draft' ? null : ago(l.days);
    const created = ago(l.days + 1);
    const description = [
      `${l.title}. ${hoodName ? hoodName.replace(' Mahallesi', '') + ', ' : ''}${l.district} konumunda ${l.net} m² net (${l.gross} m² brüt)` +
        `${l.rooms ? `, ${l.rooms}` : ''} ${CATEGORY_LABEL[l.category].toLocaleLowerCase('tr-TR')}.`,
      `Bina yaşı ${l.age}, kat: ${l.floor}.`,
      '',
      'Öne çıkanlar:',
      ...l.features.map((f) => `• ${f}`),
      '',
      'Gösterim için mesaj gönderebilir veya "İlgileniyorum" diyebilirsiniz.',
    ].join('\n');
    const [row] = await db
      .insert(listings)
      .values({
        ownerId, officeId: officeOf.get(ownerId) ?? null, dealType: l.deal, category: l.category, title: l.title, description,
        price: l.price, grossM2: l.gross, netM2: l.net, rooms: l.rooms ?? null, floor: l.floor, buildingAge: l.age,
        cityCode: '34', districtId: dId, neighbourhoodId: hoodId, cobrokeShare: l.cobroke ?? 50,
        visibility: l.visibility ?? 'public', status, isDemo: true,
        propertyNumber: `34${String(dId).padStart(4, '0')}${String(1000 + i * 37).padStart(6, '0')}`,
        eidsStatus: l.eids ?? 'verified', eidsReference: l.eids === 'pending' ? null : `EIDS-DEMO-${1000 + i}`,
        eidsCheckedAt: l.eids === 'pending' ? null : after(created, 10, 120),
        searchText: normalizeForSearch(
          [l.title, DEAL_LABEL[l.deal], CATEGORY_LABEL[l.category], l.rooms ?? '', 'İstanbul', l.district, hoodName ?? '', description.slice(0, 1000)].join(' '),
        ),
        publishedAt: published, removedReason: l.removedReason ?? null, createdAt: created, updatedAt: published ?? created,
      })
      .returning({ id: listings.id });
    const lid = row!.id;
    listingIds.push(lid);
    listingMeta.push({ id: lid, owner: ownerId, title: l.title, publishedAt: published, visibility: l.visibility ?? 'public', active: status === 'active' });

    for (const [pos, pid] of l.photos.entries()) {
      const buf = await photo(pid);
      if (!buf) break;
      const key = await storage.put(`listings/${lid}`, buf, 'jpg', 'image/jpeg');
      await db.insert(listingPhotos).values({ listingId: lid, storageKey: key, mimeType: 'image/jpeg', sizeBytes: buf.length, position: pos, createdAt: created });
      photoCount++;
    }
    if (l.eids !== 'pending' && published) {
      audit.push({ actorId: adminId, action: 'listing.eids_verified', targetType: 'listing', targetId: lid, createdAt: after(created, 10, 120) });
    }
    if (status === 'removed') {
      audit.push({ actorId: adminId, action: 'listing.removed', targetType: 'listing', targetId: lid, metadata: { reason: l.removedReason }, createdAt: ago(Math.max(1, l.days - 3)) });
      notify(ownerId, 'listing.removed', 'İlanın yayından kaldırıldı', `"${l.title}" ilanı yönetici tarafından kaldırıldı: ${l.removedReason}`, { listingId: lid }, ago(Math.max(1, l.days - 3)));
    }
  }

  // ---- 6. Takip, beğeni, kaydetme, keşfet ----
  const approvedAgents = DEMO_USERS.filter((u) => u.agent?.status === 'approved' && !u.suspended).map((u) => id(u.phone));
  const consumersIds = DEMO_USERS.filter((u) => u.role === 'consumer' && !u.suspended).map((u) => id(u.phone));
  const isAgent = new Set(approvedAgents);
  const followPairs = new Set<string>();
  const follow = (a: string, b: string, at: Date) => {
    if (a === b || followPairs.has(a + b)) return;
    followPairs.add(a + b);
    return { followerId: a, followeeId: b, createdAt: at };
  };
  const followRows = [
    ...[id('+905320000101'), id('+905320000001'), id('+905320000107')].map((b) => follow(id('+905320000008'), b, ago(20 + Math.floor(rand() * 15)))),
    ...consumersIds.flatMap((c) => sample(approvedAgents, 2 + Math.floor(rand() * 3)).map((b) => follow(c, b, ago(1 + Math.floor(rand() * 30))))),
    ...approvedAgents.flatMap((a) => sample(approvedAgents, 2 + Math.floor(rand() * 3)).map((b) => follow(a, b, ago(1 + Math.floor(rand() * 60))))),
  ].filter((x): x is NonNullable<typeof x> => !!x);
  await db.insert(follows).values(followRows);
  for (const f of followRows) {
    if (NOW - f.createdAt.getTime() < 21 * DAY) {
      notify(f.followeeId, 'social.followed', 'Yeni takipçi', `${name.get(f.followerId)} seni takip etmeye başladı`, { userId: f.followerId }, f.createdAt);
    }
  }

  const viewers = [...approvedAgents, ...consumersIds];
  const canSee = (viewer: string, m: (typeof listingMeta)[number]) =>
    viewer !== m.owner &&
    (m.visibility === 'public' ||
      (m.visibility === 'agents' && isAgent.has(viewer)) ||
      (m.visibility === 'network' && (followPairs.has(viewer + m.owner) || officeOf.get(viewer) === officeOf.get(m.owner))));
  const likes: (typeof listingLikes.$inferInsert)[] = [];
  const saves: (typeof listingSaves.$inferInsert)[] = [];
  for (const m of listingMeta.filter((x) => x.publishedAt)) {
    const age = (NOW - m.publishedAt!.getTime()) / DAY;
    const pool = viewers.filter((v) => canSee(v, m));
    for (const v of sample(pool, Math.min(pool.length, 2 + Math.floor(rand() * Math.min(12, 3 + age / 3))))) {
      const at = after(m.publishedAt!, 30, Math.max(60, age * 24 * 60));
      likes.push({ listingId: m.id, userId: v, createdAt: at });
      if (NOW - at.getTime() < 10 * DAY) {
        notify(m.owner, 'listing.liked', 'İlanın beğenildi', `${name.get(v)} "${m.title}" ilanını beğendi`, { listingId: m.id, userId: v }, at);
      }
    }
    for (const v of sample(pool, Math.floor(rand() * 5))) saves.push({ listingId: m.id, userId: v, createdAt: after(m.publishedAt!, 60, Math.max(120, age * 24 * 60)) });
  }
  await db.insert(listingLikes).values(likes);
  if (saves.length) await db.insert(listingSaves).values(saves);
  // Selin'in kaydedilenleri dolu olsun
  await db.insert(listingSaves).values([listingIds[0]!, listingIds[8]!, listingIds[20]!, listingIds[24]!].map((l) => ({ listingId: l, userId: id('+905320000008'), createdAt: ago(3) }))).onConflictDoNothing();

  // ---- 7. İlgi (el sıkışma), eşleşmeler ve konuşmalar ----
  const conversationOf = new Map<string, string>();
  async function conversation(a: string, b: string, at: Date) {
    const key = [a, b].sort().join(':');
    let cid = conversationOf.get(key);
    if (!cid) {
      const [c] = await db.insert(conversations).values({ pairKey: key, createdAt: at }).returning({ id: conversations.id });
      cid = c!.id;
      conversationOf.set(key, cid);
      await db.insert(conversationParticipants).values([
        { conversationId: cid, userId: a, createdAt: at },
        { conversationId: cid, userId: b, createdAt: at },
      ]);
    }
    return cid;
  }
  async function say(cid: string, from: string | null, body: string, at: Date, extra: Partial<typeof messages.$inferInsert> = {}) {
    await db.insert(messages).values({ conversationId: cid, senderId: from, body, createdAt: at, kind: from ? 'text' : 'system', ...extra });
    await db.update(conversations).set({ lastMessageAt: at }).where(eq(conversations.id, cid));
    return at;
  }

  let script = 0;
  for (const [phone, idx, status, note, days] of INTERESTS) {
    const requester = id(phone);
    const m = listingMeta[idx]!;
    const at = ago(days);
    let swipeId: string | null = null;
    if (!note) {
      const [s] = await db.insert(listingSwipes).values({ userId: requester, listingId: m.id, decision: 'like', createdAt: at }).returning({ id: listingSwipes.id });
      swipeId = s!.id;
    }
    const decidedAt = status === 'pending' ? null : after(at, 20, 300);
    await db.insert(interests).values({ listingId: m.id, requesterId: requester, ownerId: m.owner, status, note, swipeId, decidedAt, createdAt: at, updatedAt: decidedAt ?? at });
    notify(m.owner, 'interest.received', isAgent.has(requester) ? 'Danışman ilgisi' : 'Yeni ilgi', `${name.get(requester)} "${m.title}" ilanınla ilgileniyor`, { listingId: m.id }, at);
    if (status === 'accepted') {
      notify(requester, 'interest.accepted', 'Eşleştiniz', `${name.get(m.owner)} "${m.title}" ilanı için ilgini kabul etti`, { listingId: m.id }, decidedAt!);
      const cid = await conversation(requester, m.owner, decidedAt!);
      let t = await say(cid, null, `"${m.title}" ilanı için eşleştiniz. Artık mesajlaşabilirsiniz.`, decidedAt!);
      const lines = CHAT_SCRIPTS[isAgent.has(requester) ? 3 : script++ % 3]!;
      for (const [j, line] of lines.entries()) t = await say(cid, j % 2 === 0 ? requester : m.owner, line, after(t, 5, 240));
    } else if (status === 'declined') {
      notify(requester, 'interest.declined', 'İlgin yanıtlandı', `"${m.title}" ilanı için ilgin şu an uygun bulunmadı`, { listingId: m.id }, decidedAt!);
    }
  }
  // Geçmiş haftalara yayılmış ilgi ve kısa yazışmalar (grafikler için)
  {
    const requesters = [...consumersIds, ...approvedAgents];
    const SHORT = [
      ['Merhaba, ilan hâlâ güncel mi?', 'Merhaba, evet güncel. Ne zaman bakmak istersiniz?', 'Bu hafta içi akşam uygun olur.'],
      ['Fiyatta pazarlık payı var mı?', 'Mal sahibiyle görüşüp size dönüş yapacağım.'],
      ['Gösterim için teşekkürler, ailemle karar verip yazacağım.', 'Rica ederim, sorularınız olursa buradayım.'],
    ];
    const taken = new Set(INTERESTS.map(([ph, idx]) => id(ph) + listingMeta[idx]!.id));
    let made = 0;
    for (let tries = 0; made < 44 && tries < 500; tries++) {
      const days = 4 + Math.floor(rand() * 78);
      const at = ago(days);
      const m = pick(listingMeta.filter((x) => x.publishedAt && x.publishedAt < at));
      if (!m) continue;
      const requester = pick(requesters);
      if (taken.has(requester + m.id) || !canSee(requester, m)) continue;
      taken.add(requester + m.id);
      made++;
      const r = rand();
      const status = days < 12 && r < 0.3 ? 'pending' : r < 0.65 ? 'accepted' : r < 0.9 ? 'declined' : 'withdrawn';
      const decidedAt = status === 'pending' ? null : after(at, 30, 600);
      await db.insert(interests).values({ listingId: m.id, requesterId: requester, ownerId: m.owner, status, decidedAt, createdAt: at, updatedAt: decidedAt ?? at });
      if (status !== 'accepted') continue;
      const cid = await conversation(requester, m.owner, decidedAt!);
      let t = await say(cid, null, `"${m.title}" ilanı için eşleştiniz. Artık mesajlaşabilirsiniz.`, decidedAt!);
      for (const [j, line] of pick(SHORT).entries()) t = await say(cid, j % 2 === 0 ? requester : m.owner, line, after(t, 10, 900));
    }
  }
  // Danışmanlar arası iş birliği ve ofis içi yazışma (ilan kartıyla)
  {
    const ayse = id('+905320000001');
    const kerem = id('+905320000101');
    const mehmet = id('+905320000002');
    let cid = await conversation(ayse, kerem, ago(4));
    let t = await say(cid, ayse, 'Merhaba Kerem Bey, Bebek\'teki ilanınız için bütçesi uygun bir alıcım var.', ago(4));
    t = await say(cid, ayse, 'Paylaştığım ilan', after(t, 1, 2), { kind: 'listing', listingId: listingIds[8]! });
    t = await say(cid, kerem, 'Merhaba Ayşe Hanım, memnuniyetle. Perşembe 15:00 gösterim yapabiliriz.', after(t, 30, 120));
    await say(cid, kerem, 'Komisyon paylaşımı ilanda yazdığı gibi %50.', after(t, 2, 10));
    cid = await conversation(ayse, mehmet, ago(1));
    t = await say(cid, mehmet, 'Kozyatağı rezidans için yarın iki gösterim ayarladım.', ago(1));
    await say(cid, ayse, 'Süper, Moda\'daki daire için de ödeme bağlantısını gönderdim.', after(t, 10, 60));
    // Okunma: her konuşmada katılımcı son mesajı okumuş say; Ayşe'nin son gelen mesajı okunmamış kalsın
    await db.execute(sql`
      update conversation_participants cp set last_read_at = c.last_message_at
      from conversations c where c.id = cp.conversation_id
        and cp.conversation_id in (select conversation_id from conversation_participants where user_id in ${demoIds})`);
    await db
      .update(conversationParticipants)
      .set({ lastReadAt: ago(5) })
      .where(and(eq(conversationParticipants.userId, ayse), eq(conversationParticipants.conversationId, conversationOf.get([ayse, kerem].sort().join(':'))!)));
  }
  // Keşfet: birkaç "geç" kararı (kartlar tükenmesin diye az)
  const swipes: (typeof listingSwipes.$inferInsert)[] = [];
  for (const c of consumersIds.slice(0, 8)) {
    for (const m of sample(listingMeta.filter((x) => x.active && canSee(c, x)), 2)) {
      swipes.push({ userId: c, listingId: m.id, decision: 'pass', createdAt: ago(Math.floor(rand() * 20)) });
    }
  }
  if (swipes.length) await db.insert(listingSwipes).values(swipes).onConflictDoNothing();

  // ---- 8. Ödemeler ----
  for (const [n, phone] of PAYOUT_AGENTS.entries()) {
    const uid = id(phone);
    await db.insert(payoutAccounts).values({
      userId: uid, holderName: name.get(uid)!, iban: iban(n + 1), taxId: tckn(n + 11), status: 'verified', providerRef: `MOCK-SUB-${n + 1}`, createdAt: ago(90),
    });
  }
  const hasAccount = new Set(PAYOUT_AGENTS.map(id));
  const feeBps = env.PLATFORM_FEE_BPS;
  for (const pmt of PAYMENTS) {
    const creator = id(pmt.creator);
    const created = ago(pmt.days);
    const amount = pmt.amountTl * 100;
    const buyerAgentId = pmt.buyerAgent ? id(pmt.buyerAgent) : null;
    const paidAt = pmt.status === 'paid' ? after(created, 60, 2_000) : null;
    const [r] = await db
      .insert(paymentRequests)
      .values({
        publicToken: randomBytes(18).toString('base64url'), createdBy: creator, listingId: listingIds[pmt.listing]!,
        buyerAgentId, buyerShare: pmt.buyerShare ?? 0, payerName: pmt.payer, payerPhone: '+90555' + String(1000000 + Math.floor(rand() * 8999999)),
        description: pmt.description, amount, platformFeeBps: feeBps, status: pmt.status,
        expiresAt: new Date(created.getTime() + env.PAYMENT_LINK_DAYS * DAY), provider: 'mock',
        providerSessionId: `mock_${randomBytes(6).toString('hex')}`, providerPaymentId: paidAt ? `mockpay_${randomBytes(6).toString('hex')}` : null,
        paidAt, cancelledAt: pmt.status === 'cancelled' ? after(created, 60, 600) : null, createdAt: created, updatedAt: paidAt ?? created,
      })
      .returning({ id: paymentRequests.id });
    audit.push({ actorId: creator, action: 'payment_request.created', targetType: 'payment_request', targetId: r!.id, createdAt: created });
    if (pmt.status === 'cancelled') audit.push({ actorId: creator, action: 'payment_request.cancelled', targetType: 'payment_request', targetId: r!.id, createdAt: after(created, 60, 600) });
    if (!paidAt) continue;
    const split = splitAmount(amount, feeBps, buyerAgentId ? (pmt.buyerShare ?? 0) : 0);
    const settled = (uid: string) => (hasAccount.has(uid) ? { payoutStatus: 'settled' as const, settledAt: after(paidAt, 600, 3_000) } : { payoutStatus: 'held' as const });
    await db.insert(paymentSplits).values([
      { requestId: r!.id, kind: 'platform', amount: split.platform, payoutStatus: 'settled', settledAt: paidAt, createdAt: paidAt },
      { requestId: r!.id, kind: 'seller_agent', userId: creator, amount: split.seller, ...settled(creator), createdAt: paidAt },
      ...(buyerAgentId && split.buyer > 0
        ? [{ requestId: r!.id, kind: 'buyer_agent' as const, userId: buyerAgentId, amount: split.buyer, ...settled(buyerAgentId), createdAt: paidAt }]
        : []),
    ]);
    const v = vatFromGross(split.platform, env.VAT_RATE_BPS);
    await db.insert(invoices).values({ requestId: r!.id, userId: creator, net: v.net, vat: v.vat, total: v.total, vatRateBps: env.VAT_RATE_BPS, createdAt: paidAt });
    if (NOW - paidAt.getTime() < 30 * DAY) {
      notify(creator, 'payment.paid', 'Ödeme alındı', `${pmt.payer} ${tl(pmt.amountTl)} ödedi; payın ${tl(split.seller / 100)}`, { requestId: r!.id }, paidAt);
      if (buyerAgentId) notify(buyerAgentId, 'payment.paid', 'Paylaşımlı ödeme alındı', `${pmt.payer} ödemesinden payın ${tl(split.buyer / 100)}`, { requestId: r!.id }, paidAt);
    }
  }

  // ---- 9. Şikâyetler ----
  for (const [phone, idx, reason, note, status, days] of REPORTS) {
    const at = ago(days);
    const resolvedAt = status === 'open' ? null : after(at, 60, 1_440);
    const [rep] = await db
      .insert(listingReports)
      .values({
        listingId: listingIds[idx]!, reporterId: id(phone), reason, note, status, createdAt: at,
        resolvedBy: resolvedAt ? adminId : null, resolvedAt,
        resolution: status === 'resolved' ? 'İlan yayından kaldırıldı' : status === 'dismissed' ? 'İlan bilgileri yeterli bulundu' : null,
      })
      .returning({ id: listingReports.id });
    if (status === 'dismissed') audit.push({ actorId: adminId, action: 'report.dismissed', targetType: 'report', targetId: rep!.id, createdAt: resolvedAt! });
  }

  // ---- 10. Bildirimler ve denetim kayıtları ----
  // Yönetici bildirimleri ve ofis talepleri
  notify(id('+905320000001'), 'office.join_requested', 'Katılma talebi', 'Tolga Uçar ofisine katılmak istiyor', { officeId: officeIds.get('yilmaz') }, ago(1));
  notify(id('+905320000107'), 'office.invited', 'Ofis daveti', 'Boğaziçi Gayrimenkul Beşiktaş seni ekibine davet etti', { officeId: officeIds.get('bogazici') }, ago(2));
  for (let i = 0; i < notes.length; i += 500) await db.insert(notifications).values(notes.slice(i, i + 500));
  if (audit.length) await db.insert(auditLogs).values(audit);

  // ---- Özet ----
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]!.n;
  const totals = {
    listings: listingIds.length,
    photos: photoCount,
    likes: likes.length,
    interests: INTERESTS.length,
    conversations: conversationOf.size,
    payments: PAYMENTS.length,
    notifications: notes.length,
    users: await count(db.select({ n: sql<number>`count(*)::int` }).from(users).where(inArray(users.id, demoIds))),
  };
  console.log('\nDemo verisi hazır:', Object.entries(totals).map(([k, v]) => `${v} ${k}`).join(' · '));
  console.log('\nAna hesaplar (giriş: telefon + OTP):\n');
  for (const u of DEMO_USERS.filter((x) => x.primary)) {
    console.log(`  ${u.phone.replace('+90', '0')}  ${u.fullName.padEnd(16)} ${u.label}`);
  }
  console.log(`\n  + ${DEMO_USERS.length - DEMO_USERS.filter((x) => x.primary).length} ek demo kullanıcısı (0532 000 01 01–32)\n`);
} finally {
  await pool.end();
}
