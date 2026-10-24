import { Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { SettingsService } from './settings.service.js';

/** Olay kategorileri: denetim kaydındaki eylem önekine göre */
export const LOG_CATEGORIES: Record<string, { label: string; patterns: string[] }> = {
  auth: { label: 'Giriş / çıkış', patterns: ['auth.%', 'password.%', 'session.%'] },
  listing: { label: 'İlan', patterns: ['listing.%'] },
  interaction: { label: 'Etkileşim', patterns: ['interest.%'] },
  payment: { label: 'Ödeme', patterns: ['payment%', 'payout_account.%'] },
  account: { label: 'Hesap', patterns: ['user.onboarded', 'consent.%', 'agent.submitted'] },
  admin: {
    label: 'Yönetim',
    patterns: ['agent.approved', 'agent.rejected', 'office.%', 'user.suspended', 'user.reactivated', 'report.%', 'settings.%', 'document_type.%', 'badges.%'],
  },
};

export interface LogQuery {
  category?: string;
  action?: string;
  q?: string;
  userId?: string;
  range?: 'today' | '7d' | '30d' | 'all';
  limit?: number;
  offset?: number;
}

@Injectable()
export class LogsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private async onlineMinutes() {
    return (await this.settings.general()).onlineWindowMinutes;
  }

  async overview() {
    const win = await this.onlineMinutes();
    const { rows } = await this.db.execute<Record<string, number>>(sql`
      select
        (select count(*)::int from users where last_seen_at > now() - make_interval(mins => ${win})) as online,
        (select count(*)::int from users where last_seen_at > date_trunc('day', now())) as active_today,
        (select count(*)::int from users where last_seen_at > now() - interval '7 days') as active_7d,
        (select count(*)::int from sessions where revoked_at is null and expires_at > now()) as open_sessions,
        (select count(*)::int from audit_logs where action = 'auth.login' and created_at > now() - interval '24 hours') as logins_24h,
        (select count(*)::int from audit_logs where action in ('auth.login_failed', 'auth.locked') and created_at > now() - interval '24 hours') as failed_24h,
        (select count(*)::int from audit_logs where action like 'listing.%' and created_at > now() - interval '24 hours') as listing_events_24h,
        (select count(*)::int from audit_logs where created_at > now() - interval '24 hours') as events_24h`);
    const r = rows[0]!;
    const hourly = await this.db.execute<{ hour: string; logins: number; events: number }>(sql`
      select h::text as hour,
        (select count(*)::int from audit_logs a where a.action = 'auth.login' and date_trunc('hour', a.created_at) = h) as logins,
        (select count(*)::int from audit_logs a where date_trunc('hour', a.created_at) = h) as events
      from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h
      order by h`);
    return {
      onlineWindowMinutes: win,
      online: r.online,
      activeToday: r.active_today,
      active7d: r.active_7d,
      openSessions: r.open_sessions,
      logins24h: r.logins_24h,
      failed24h: r.failed_24h,
      listingEvents24h: r.listing_events_24h,
      events24h: r.events_24h,
      hourly: hourly.rows,
      categories: Object.entries(LOG_CATEGORIES).map(([key, v]) => ({ key, label: v.label })),
    };
  }

  /** Son görülme zamanına göre kullanıcılar: çevrimiçi (pencere içinde) ve bugün aktif */
  async online(scope: 'online' | 'today', limit = 100, offset = 0) {
    const win = await this.onlineMinutes();
    const cond = scope === 'online' ? sql`u.last_seen_at > now() - make_interval(mins => ${win})` : sql`u.last_seen_at > date_trunc('day', now())`;
    const { rows } = await this.db.execute(sql`
      select u.id, u.full_name as "fullName", u.phone, u.role, u.status, u.last_seen_at as "lastSeenAt",
        (u.last_seen_at > now() - make_interval(mins => ${win})) as online,
        s.ip, s.user_agent as "userAgent", s.created_at as "sessionStartedAt",
        (select count(*)::int from sessions x where x.user_id = u.id and x.revoked_at is null and x.expires_at > now()) as sessions,
        (select o.name from office_memberships m join offices o on o.id = m.office_id where m.user_id = u.id and m.status = 'active' limit 1) as office
      from users u
      left join lateral (
        select ip, user_agent, created_at from sessions
        where user_id = u.id and revoked_at is null order by coalesce(last_used_at, created_at) desc limit 1
      ) s on true
      where ${cond}
      order by u.last_seen_at desc
      limit ${limit} offset ${offset}`);
    const total = await this.db.execute<{ n: number }>(sql`select count(*)::int as n from users u where ${cond}`);
    return { items: rows, total: total.rows[0]!.n };
  }

  async sessions(limit = 100, offset = 0) {
    const { rows } = await this.db.execute(sql`
      select s.id, s.user_id as "userId", u.full_name as "fullName", u.role, s.ip, s.user_agent as "userAgent",
        s.created_at as "createdAt", coalesce(s.last_used_at, s.created_at) as "lastUsedAt", s.expires_at as "expiresAt"
      from sessions s join users u on u.id = s.user_id
      where s.revoked_at is null and s.expires_at > now()
      order by coalesce(s.last_used_at, s.created_at) desc
      limit ${limit} offset ${offset}`);
    const total = await this.db.execute<{ n: number }>(sql`select count(*)::int as n from sessions where revoked_at is null and expires_at > now()`);
    return { items: rows, total: total.rows[0]!.n };
  }

  async revokeSession(adminId: string, id: string) {
    const { rows } = await this.db.execute<{ user_id: string }>(sql`
      update sessions set revoked_at = now() where id = ${id} and revoked_at is null returning user_id`);
    if (!rows[0]) throw new NotFoundException('Oturum bulunamadı');
    await this.audit.log({ actorId: adminId, action: 'session.revoked', targetType: 'user', targetId: rows[0].user_id, metadata: { sessionId: id } });
    return { ok: true };
  }

  async events(q: LogQuery) {
    const conds: SQL[] = [sql`true`];
    const cat = q.category ? LOG_CATEGORIES[q.category] : undefined;
    if (cat) conds.push(sql`(${sql.join(cat.patterns.map((p) => sql`a.action like ${p}`), sql` or `)})`);
    if (q.action) conds.push(sql`a.action = ${q.action}`);
    if (q.userId) conds.push(sql`a.actor_id = ${q.userId}`);
    if (q.q?.trim()) {
      const like = `%${q.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conds.push(sql`(u.full_name ilike ${like} or u.phone ilike ${like} or a.ip ilike ${like} or a.metadata::text ilike ${like} or a.action ilike ${like})`);
    }
    if (q.range === 'today') conds.push(sql`a.created_at > date_trunc('day', now())`);
    else if (q.range === '7d') conds.push(sql`a.created_at > now() - interval '7 days'`);
    else if (q.range === '30d') conds.push(sql`a.created_at > now() - interval '30 days'`);
    const where = sql.join(conds, sql` and `);
    const limit = Math.min(100, Math.max(1, q.limit ?? 100));
    const offset = Math.max(0, q.offset ?? 0);
    const { rows } = await this.db.execute(sql`
      select a.id, a.action, a.target_type as "targetType", a.target_id as "targetId", a.metadata, a.ip,
        a.user_agent as "userAgent", a.created_at as "createdAt",
        a.actor_id as "actorId", u.full_name as "actorName", u.role as "actorRole",
        case when a.target_type = 'listing' then (select title from listings l where l.id::text = a.target_id)
             when a.target_type = 'user' then (select full_name from users t where t.id::text = a.target_id)
             when a.target_type = 'office' then (select name from offices o where o.id::text = a.target_id)
             else null end as "targetLabel"
      from audit_logs a left join users u on u.id = a.actor_id
      where ${where}
      order by a.created_at desc
      limit ${limit} offset ${offset}`);
    const total = await this.db.execute<{ n: number }>(sql`
      select count(*)::int as n from audit_logs a left join users u on u.id = a.actor_id where ${where}`);
    return { items: rows, total: total.rows[0]!.n };
  }
}
