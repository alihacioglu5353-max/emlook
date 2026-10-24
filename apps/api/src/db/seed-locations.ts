/**
 * İl, ilçe ve mahalle verisini yükler: `pnpm db:seed-locations`
 * Kaynak: turkey-neighbourhoods (PTT posta kodu listesi, MIT lisansı).
 * Tekrar çalıştırılabilir; mevcut kayıtlar atlanır.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getCities, getDistrictsAndNeighbourhoodsByCityCode } from 'turkey-neighbourhoods';
import { cities, districts, neighbourhoods } from './schema.js';

/** "Bostancı Mah" → "Bostancı Mahallesi"; "Mah)" gibi parantezli halleri de düzeltir. */
export function cleanNeighbourhoodName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ Mah(\)?)$/, ' Mahallesi$1');
}

export async function seedLocations(db: NodePgDatabase): Promise<{ cities: number; districts: number; neighbourhoods: number }> {
  const cityRows = getCities().map((c) => ({ code: c.code, name: c.name }));
  await db.insert(cities).values(cityRows).onConflictDoNothing();

  let districtCount = 0;
  let neighbourhoodCount = 0;
  for (const city of cityRows) {
    const tree = getDistrictsAndNeighbourhoodsByCityCode(city.code);
    for (const [districtName, list] of Object.entries(tree)) {
      await db.insert(districts).values({ cityCode: city.code, name: districtName }).onConflictDoNothing();
      const [d] = await db
        .select({ id: districts.id })
        .from(districts)
        .where(and(eq(districts.cityCode, city.code), eq(districts.name, districtName)));
      districtCount++;

      const names = [...new Set(list.map(cleanNeighbourhoodName))];
      for (let i = 0; i < names.length; i += 1000) {
        await db
          .insert(neighbourhoods)
          .values(names.slice(i, i + 1000).map((name) => ({ districtId: d.id, name })))
          .onConflictDoNothing();
      }
      neighbourhoodCount += names.length;
    }
  }
  return { cities: cityRows.length, districts: districtCount, neighbourhoods: neighbourhoodCount };
}

/** Testler için: veri zaten yüklü mü? */
export async function locationsLoaded(db: NodePgDatabase): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(cities);
  return n > 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL tanımlı değil');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    const started = Date.now();
    const r = await seedLocations(drizzle(pool));
    console.log(
      `${r.cities} il, ${r.districts} ilçe, ${r.neighbourhoods} mahalle/köy yüklendi (${Math.round((Date.now() - started) / 1000)} sn)`,
    );
  } finally {
    await pool.end();
  }
}
