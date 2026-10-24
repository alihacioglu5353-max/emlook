/**
 * Bekleyen SQL migration'larını uygular: `pnpm db:migrate`
 * Migration dosyaları `drizzle/` klasöründedir ve `pnpm db:generate` ile
 * şemadan üretilir.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}

const isEntry = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntry) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL tanımlı değil');
    process.exit(1);
  }
  await runMigrations(url);
  console.log('Migration tamamlandı');
}
