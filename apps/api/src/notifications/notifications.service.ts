import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import { InjectDb, type Database } from '../db/db.module.js';
import { notifications } from '../db/schema.js';
import { PushService } from '../push/push.service.js';

export type NotificationType =
  | 'office.approved'
  | 'office.rejected'
  | 'office.join_requested'
  | 'office.request_approved'
  | 'office.request_declined'
  | 'office.invited'
  | 'office.invite_accepted'
  | 'office.invite_declined'
  | 'office.member_left'
  | 'office.member_transferred'
  | 'office.member_removed'
  | 'office.role_changed'
  | 'social.followed'
  | 'listing.liked'
  | 'interest.received'
  | 'interest.accepted'
  | 'interest.declined'
  | 'payment.request_created'
  | 'payment.paid'
  | 'account.reactivated'
  | 'listing.removed'
  | 'listing.restored'
  | 'listing.eids_verified'
  | 'listing.eids_failed';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Tür, yalnızca eklenebilen işlemler için transaction nesnesi de kabul eder. */
type Writer = Pick<Database, 'insert'>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly push: PushService,
  ) {}

  /** Bildirim kaydı oluşturur ve kullanıcının cihazlarına push gönderir. */
  async notify(items: NewNotification | NewNotification[], tx: Writer = this.db) {
    const rows = (Array.isArray(items) ? items : [items]).map((n) => ({
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data ?? null,
    }));
    if (rows.length === 0) return;
    await tx.insert(notifications).values(rows);
    for (const n of rows) {
      this.push.dispatch([n.userId], {
        title: n.title,
        body: n.body,
        data: { type: n.type, ...stringify(n.data) },
      });
    }
  }

  async list(userId: string, limit: number, before?: Date) {
    const where = before
      ? and(eq(notifications.userId, userId), lt(notifications.createdAt, before))
      : eq(notifications.userId, userId);
    const items = await this.db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        data: notifications.data,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return { items, unread: await this.unreadCount(userId) };
  }

  async unreadCount(userId: string): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return value;
  }

  async markRead(userId: string, id: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      );
    return { unread: await this.unreadCount(userId) };
  }

  async markAllRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { unread: 0 };
  }
}

/** Push verisi yalnızca metin değer taşır */
function stringify(data: Record<string, unknown> | null): Record<string, string> {
  if (!data) return {};
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
}
