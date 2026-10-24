import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, ne, sql, type SQL } from 'drizzle-orm';
import { normalizeForSearch } from '../common/text.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { cities, districts, listings, users } from '../db/schema.js';
import { FeedService } from '../feed/feed.service.js';
import { listingCards, visibleActive, type Viewer } from '../listings/listing-cards.js';
import type { SearchQuery } from './dto.js';
import { fold, parseQuery, type LocationIndex, type ParsedQuery } from './parse-query.js';

const PAGE = 20;

/** LIKE özel karakterlerini kaçırır */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class SearchService {
  private index: Promise<LocationIndex> | null = null;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly feed: FeedService,
  ) {}

  /** İl/ilçe adları bellekte tutulur (81 + 973 kayıt) */
  private locations(): Promise<LocationIndex> {
    this.index ??= (async () => {
      const [c, d] = await Promise.all([
        this.db.select().from(cities),
        this.db.select({ id: districts.id, cityCode: districts.cityCode, name: districts.name }).from(districts),
      ]);
      return {
        cities: c.map((x) => ({ ...x, norm: fold(x.name) })),
        districts: d.map((x) => ({ ...x, norm: fold(x.name) })),
      };
    })().catch((e: unknown) => {
      this.index = null;
      throw e;
    });
    return this.index;
  }

  /**
   * İlan araması. Serbest metin (`q`) ayrıştırılır; açık parametreler ayrıştırılan
   * değerlerin önüne geçer. Kendi ilanların da sonuçlarda yer alır.
   */
  async search(viewer: Viewer, q: SearchQuery) {
    const parsed: ParsedQuery = q.q?.trim() ? parseQuery(q.q, await this.locations()) : { text: [] };
    const f = {
      dealType: q.dealType ?? parsed.dealType,
      category: q.category ?? parsed.category,
      rooms: q.rooms ?? parsed.rooms,
      minPrice: q.minPrice ?? parsed.minPrice,
      maxPrice: q.maxPrice ?? parsed.maxPrice,
      minM2: q.minM2 ?? parsed.minM2,
      maxM2: q.maxM2 ?? parsed.maxM2,
      cityCode: q.cityCode ?? parsed.city?.code,
      districtId: q.districtId ?? (q.cityCode && q.cityCode !== parsed.city?.code ? undefined : parsed.district?.id),
    };

    const conds: SQL[] = [visibleActive(viewer), eq(users.status, 'active')];
    if (f.dealType) conds.push(eq(listings.dealType, f.dealType));
    if (f.category) conds.push(eq(listings.category, f.category));
    if (f.rooms) conds.push(eq(listings.rooms, f.rooms));
    if (f.minPrice !== undefined) conds.push(gte(listings.price, f.minPrice));
    if (f.maxPrice !== undefined) conds.push(lte(listings.price, f.maxPrice));
    // Alan: net yoksa brüt
    const area = sql`coalesce(${listings.netM2}, ${listings.grossM2})`;
    if (f.minM2 !== undefined) conds.push(sql`${area} >= ${f.minM2}`);
    if (f.maxM2 !== undefined) conds.push(sql`${area} <= ${f.maxM2}`);
    if (f.cityCode) conds.push(eq(listings.cityCode, f.cityCode));
    if (f.districtId) conds.push(eq(listings.districtId, f.districtId));
    if (q.neighbourhoodId) conds.push(eq(listings.neighbourhoodId, q.neighbourhoodId));
    if (q.excludeMine) conds.push(ne(listings.ownerId, viewer.id));
    for (const word of parsed.text) {
      conds.push(sql`${listings.searchText} ilike ${`%${likeEscape(word)}%`}`);
    }

    const order =
      q.sort === 'price_asc'
        ? [asc(listings.price), desc(listings.id)]
        : q.sort === 'price_desc'
          ? [desc(listings.price), desc(listings.id)]
          : [desc(listings.publishedAt), desc(listings.id)];

    const limit = q.limit ?? PAGE;
    const offset = q.offset ?? 0;
    const where = and(...conds)!;
    const [items, [{ total }]] = await Promise.all([
      listingCards(this.db, viewer, { where, orderBy: order, limit: limit + 1, offset }),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(listings)
        .innerJoin(users, eq(users.id, listings.ownerId))
        .where(where),
    ]);

    return {
      parsed: {
        dealType: parsed.dealType ?? null,
        category: parsed.category ?? null,
        rooms: parsed.rooms ?? null,
        minPrice: parsed.minPrice ?? null,
        maxPrice: parsed.maxPrice ?? null,
        minM2: parsed.minM2 ?? null,
        maxM2: parsed.maxM2 ?? null,
        city: parsed.city ?? null,
        district: parsed.district ?? null,
        text: parsed.text,
      },
      total,
      items: items.slice(0, limit),
      nextOffset: items.length > limit ? offset + limit : null,
    };
  }

  /** Danışman araması: ad, unvan veya ofis adı (Türkçe karakterden bağımsız) */
  async agents(viewer: Viewer, q: string, limit = 10) {
    const words = normalizeForSearch(q).split(' ').filter((w) => w.length >= 2).slice(0, 5);
    if (words.length === 0) return [];
    const foldSql = (col: SQL) =>
      sql`lower(translate(coalesce(${col}, ''), 'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu'))`;
    const haystack = sql`(
      ${foldSql(sql`u.full_name`)} || ' ' || ${foldSql(sql`p.business_name`)} || ' ' ||
      ${foldSql(sql`(select o.name from office_memberships m join offices o on o.id = m.office_id
                     where m.user_id = u.id and m.status = 'active' and o.status = 'active' limit 1)`)}
    )`;
    const match = sql.join(
      words.map((w) => sql`${haystack} like ${`%${likeEscape(w)}%`}`),
      sql` and `,
    );
    const { rows } = await this.db.execute<{ id: string }>(sql`
      select u.id from users u
      join agent_profiles p on p.user_id = u.id
      where u.status = 'active' and u.role = 'agent' and p.verification_status = 'approved'
        and ${match}
      order by (select count(*) from listings l where l.owner_id = u.id and l.status = 'active') desc, u.full_name
      limit ${limit}
    `);
    const cards = await this.feed.personCards(viewer.id, rows.map((r) => r.id));
    return rows.map((r) => cards.get(r.id)!).filter(Boolean);
  }
}
