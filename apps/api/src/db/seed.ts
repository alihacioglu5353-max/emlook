/**
 * Yönetici hesaplarını tanımlar: `pnpm db:seed`
 * ADMIN_PHONES içindeki numaralar admin rolüyle oluşturulur veya güncellenir.
 * Bu kişiler OTP ile normal şekilde giriş yapar.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { normalizeTrPhone } from '../common/phone.js';
import { users } from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL tanımlı değil');
  process.exit(1);
}

const phones = (process.env.ADMIN_PHONES ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

if (phones.length === 0) {
  console.log('ADMIN_PHONES boş; tanımlanacak yönetici yok');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);
try {
  for (const raw of phones) {
    const phone = normalizeTrPhone(raw);
    if (!phone) {
      console.warn(`Geçersiz numara atlandı: ${raw}`);
      continue;
    }
    await db
      .insert(users)
      .values({ phone, role: 'admin', fullName: 'Emlook Yönetici' })
      .onConflictDoUpdate({ target: users.phone, set: { role: 'admin' } });
    console.log(`Yönetici tanımlandı: ${phone}`);
  }
} finally {
  await pool.end();
}
