import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { InjectDb, type Database } from '../db/db.module.js';
import type { BadgeSettings } from './settings.defs.js';
import { SettingsService } from './settings.service.js';

/**
 * Danışman puanı ve rozeti. Puan, ayarlardaki ağırlıklarla tek bir SQL ile hesaplanır
 * ve agent_profiles.score/badge'e yazılır (kartlar ve listeler hızlı okusun diye).
 * Ayar değişince, yönetici "yeniden hesapla" deyince ve saatte bir çalışır.
 */
@Injectable()
export class BadgesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Badges');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    // Açılıştan kısa süre sonra ve sonra saatte bir
    setTimeout(() => void this.recompute().catch((e) => this.logger.warn(String(e))), 5_000).unref();
    this.timer = setInterval(() => void this.recompute().catch((e) => this.logger.warn(String(e))), 3_600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Puan ifadesi: her ölçütün sayısı × ağırlığı */
  static scoreSql(b: BadgeSettings, alias = 'u') {
    const w = b.weights;
    return sql.raw(`(
      ${w.activeListing} * (select count(*) from listings l where l.owner_id = ${alias}.id and l.status = 'active')
      + ${w.soldListing} * (select count(*) from listings l where l.owner_id = ${alias}.id and l.status = 'sold')
      + ${w.eidsVerified} * (select count(*) from listings l where l.owner_id = ${alias}.id and l.eids_status = 'verified' and l.status in ('active','sold','passive'))
      + ${w.match} * (select count(*) from interests i where i.owner_id = ${alias}.id and i.status = 'accepted')
      + ${w.likeReceived} * (select count(*) from listing_likes k join listings l on l.id = k.listing_id where l.owner_id = ${alias}.id)
      + ${w.follower} * (select count(*) from follows f where f.followee_id = ${alias}.id)
      + ${w.paidPayment} * (select count(*) from payment_requests p where p.created_by = ${alias}.id and p.status = 'paid')
      + ${w.accountMonth} * floor(extract(epoch from (now() - ${alias}.created_at)) / 2592000)
      + ${w.profileComplete} * (case when (${alias}.avatar_key is not null or ${alias}.avatar_preset is not null)
                                    and coalesce(length(ap.bio), 0) >= 20 then 1 else 0 end)
    )::int`);
  }

  static badgeFor(score: number, b: BadgeSettings) {
    const tiers = [...b.tiers].sort((x, y) => y.minScore - x.minScore);
    return tiers.find((t) => score >= t.minScore) ?? null;
  }

  /** Tüm onaylı danışmanların puan ve rozetini günceller; dağılımı döner */
  async recompute() {
    const b = await this.settings.badges();
    const tiers = [...b.tiers].sort((x, y) => y.minScore - x.minScore);
    const badgeCase = sql.raw(
      `case ${tiers.map((t) => `when s.score >= ${Number(t.minScore)} then '${t.key.replace(/'/g, '')}'`).join(' ')} else null end`,
    );
    await this.db.execute(sql`
      with s as (
        select ap.user_id, ${BadgesService.scoreSql(b)} as score
        from agent_profiles ap join users u on u.id = ap.user_id
        where ap.verification_status = 'approved'
      )
      update agent_profiles ap set score = s.score, badge = ${badgeCase}, scored_at = now()
      from s where s.user_id = ap.user_id`);
    // Onaysız profillerin rozeti olmaz
    await this.db.execute(sql`update agent_profiles set score = 0, badge = null where verification_status <> 'approved' and (badge is not null or score <> 0)`);
    return this.distribution();
  }

  async distribution() {
    const b = await this.settings.badges();
    const { rows } = await this.db.execute<{ badge: string | null; count: number; avg: number; max: number }>(sql`
      select badge, count(*)::int as count, coalesce(avg(score), 0)::int as avg, coalesce(max(score), 0)::int as max
      from agent_profiles where verification_status = 'approved' group by badge`);
    return b.tiers.map((t) => {
      const r = rows.find((x) => x.badge === t.key);
      return { ...t, count: r?.count ?? 0, avgScore: r?.avg ?? 0 };
    });
  }

  /** Rozet tanımı (etiket, renk) — kartlarda göstermek için */
  async tierInfo() {
    return (await this.settings.badges()).tiers;
  }
}
