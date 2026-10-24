/**
 * Geliştirme ve demo için örnek kullanıcılar: `pnpm --filter api db:seed-demo`
 * Her kullanıcı türünden bir hesap oluşturur (tekrar çalıştırmak güvenlidir).
 * Giriş normal OTP akışıyla yapılır; SMS_PROVIDER=console iken kod API konsoluna yazılır.
 * Üretim veritabanında çalışmaz.
 */
import 'dotenv/config';
import { and, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { LEGAL_DOCS } from '../legal/legal.texts.js';
import { agentProfiles, consents, officeMemberships, offices, users } from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL tanımlı değil');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Demo kullanıcıları üretimde oluşturulmaz');
  process.exit(1);
}

type Verification = 'draft' | 'pending' | 'approved' | 'rejected';
interface DemoUser {
  phone: string;
  fullName: string;
  role: 'admin' | 'agent' | 'consumer';
  label: string;
  agent?: { status: Verification; license?: string; businessName?: string; reason?: string };
  office?: 'owner' | 'manager' | 'agent';
  suspended?: string;
}

const CITY = 'İstanbul';
const DISTRICT = 'Kadıköy';

export const DEMO_USERS: DemoUser[] = [
  { phone: '+905320000000', fullName: 'Emlook Yönetici', role: 'admin', label: 'Yönetici' },
  {
    phone: '+905320000001', fullName: 'Ayşe Yılmaz', role: 'agent', label: 'Onaylı danışman · ofis sahibi',
    agent: { status: 'approved', license: '3400001', businessName: 'Yılmaz Gayrimenkul' }, office: 'owner',
  },
  {
    phone: '+905320000002', fullName: 'Mehmet Kaya', role: 'agent', label: 'Onaylı danışman · ofis yöneticisi',
    agent: { status: 'approved', license: '3400002', businessName: 'Yılmaz Gayrimenkul' }, office: 'manager',
  },
  {
    phone: '+905320000003', fullName: 'Zeynep Demir', role: 'agent', label: 'Onaylı danışman · ofis üyesi',
    agent: { status: 'approved', license: '3400003', businessName: 'Yılmaz Gayrimenkul' }, office: 'agent',
  },
  {
    phone: '+905320000004', fullName: 'Can Öztürk', role: 'agent', label: 'Onaylı bağımsız danışman',
    agent: { status: 'approved', license: '3400004', businessName: 'Öztürk Emlak' },
  },
  {
    phone: '+905320000005', fullName: 'Elif Şahin', role: 'agent', label: 'Danışman · başvuru incelemede',
    agent: { status: 'pending', license: '3400005', businessName: 'Şahin Emlak' },
  },
  {
    phone: '+905320000006', fullName: 'Burak Arslan', role: 'agent', label: 'Danışman · başvuru reddedildi',
    agent: { status: 'rejected', license: '3400006', businessName: 'Arslan Emlak', reason: 'Yetki belgesi okunmuyor; net bir kopya yükleyin.' },
  },
  {
    phone: '+905320000007', fullName: 'Deniz Koç', role: 'agent', label: 'Danışman · başvuru başlamadı',
    agent: { status: 'draft' },
  },
  { phone: '+905320000008', fullName: 'Selin Aydın', role: 'consumer', label: 'Mülk sahibi / alıcı' },
  {
    phone: '+905320000009', fullName: 'Hakan Çelik', role: 'consumer', label: 'Mülk sahibi · askıya alınmış',
    suspended: 'Demo: kurallara aykırı içerik',
  },
];

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);

try {
  const ids = new Map<string, string>();
  const now = new Date();

  for (const u of DEMO_USERS) {
    const [row] = await db
      .insert(users)
      .values({
        phone: u.phone,
        fullName: u.fullName,
        role: u.role,
        status: u.suspended ? 'suspended' : 'active',
        suspendedReason: u.suspended ?? null,
        suspendedAt: u.suspended ? now : null,
      })
      .onConflictDoUpdate({
        target: users.phone,
        set: {
          fullName: u.fullName,
          role: u.role,
          status: u.suspended ? 'suspended' : 'active',
          suspendedReason: u.suspended ?? null,
          suspendedAt: u.suspended ? now : null,
        },
      })
      .returning({ id: users.id });
    ids.set(u.phone, row.id);

    // Kayıt tamamlanmış sayılması için rızalar (yalnızca hiç yoksa)
    if (u.role !== 'admin') {
      const has = await db.select({ id: consents.id }).from(consents).where(eq(consents.userId, row.id)).limit(1);
      if (has.length === 0) {
        await db.insert(consents).values([
          { userId: row.id, type: 'kvkk_clarification', version: LEGAL_DOCS.kvkk.version, granted: true },
          { userId: row.id, type: 'terms_of_use', version: LEGAL_DOCS.kosullar.version, granted: true },
          { userId: row.id, type: 'marketing', version: LEGAL_DOCS['ticari-ileti'].version, granted: false },
        ]);
      }
    }

    if (u.agent) {
      const a = u.agent;
      const values = {
        verificationStatus: a.status,
        licenseNumber: a.license ?? null,
        businessName: a.businessName ?? null,
        city: a.status === 'draft' ? null : CITY,
        district: a.status === 'draft' ? null : DISTRICT,
        submittedAt: a.status === 'draft' ? null : now,
        reviewedAt: a.status === 'approved' || a.status === 'rejected' ? now : null,
        rejectionReason: a.reason ?? null,
      };
      await db
        .insert(agentProfiles)
        .values({ userId: row.id, ...values })
        .onConflictDoUpdate({ target: agentProfiles.userId, set: values });
    }
  }

  // Ofis: Ayşe sahibi, Mehmet yönetici, Zeynep danışman
  const ownerId = ids.get('+905320000001')!;
  let [office] = await db
    .select({ id: offices.id })
    .from(offices)
    .where(and(eq(offices.ownerId, ownerId), ne(offices.status, 'rejected')));
  if (!office) {
    [office] = await db
      .insert(offices)
      .values({
        name: 'Yılmaz Gayrimenkul Kadıköy',
        legalName: 'Yılmaz Gayrimenkul Danışmanlık Ltd. Şti.',
        licenseNumber: '3400100',
        city: CITY,
        district: DISTRICT,
        ownerId,
        status: 'active',
        reviewedAt: now,
      })
      .returning({ id: offices.id });
  } else {
    await db.update(offices).set({ status: 'active' }).where(eq(offices.id, office.id));
  }

  for (const u of DEMO_USERS.filter((x) => x.office)) {
    const userId = ids.get(u.phone)!;
    const [active] = await db
      .select({ id: officeMemberships.id, officeId: officeMemberships.officeId })
      .from(officeMemberships)
      .where(and(eq(officeMemberships.userId, userId), eq(officeMemberships.status, 'active')));
    if (active && active.officeId !== office.id) {
      await db.update(officeMemberships).set({ status: 'left', endedAt: now }).where(eq(officeMemberships.id, active.id));
    }
    if (active && active.officeId === office.id) {
      await db.update(officeMemberships).set({ role: u.office! }).where(eq(officeMemberships.id, active.id));
    } else {
      await db.insert(officeMemberships).values({
        officeId: office.id,
        userId,
        role: u.office!,
        status: 'active',
        decidedAt: now,
      });
    }
  }

  console.log('\nDemo kullanıcıları hazır (giriş: telefon + OTP):\n');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.phone.replace('+90', '0')}  ${u.fullName.padEnd(16)} ${u.label}`);
  }
  console.log('');
} finally {
  await pool.end();
}
