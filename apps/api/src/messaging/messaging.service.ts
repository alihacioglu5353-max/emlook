import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { InjectDb, type Database } from '../db/db.module.js';
import {
  agentProfiles,
  conversationParticipants,
  conversations,
  interests,
  listings,
  messages,
  users,
} from '../db/schema.js';
import { photoPath, visibleTo, type Viewer } from '../listings/listing-cards.js';
import { PushService } from '../push/push.service.js';
import type { MessagesQuery, SendMessageDto, StartConversationDto } from './dto.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Conn = Database | Tx;

/** Mesaj imleci: ekleme sırası numarası */
function seqOf(raw: string): number {
  if (!/^\d{1,15}$/.test(raw)) {
    throw new BadRequestException({ code: 'BAD_CURSOR', message: 'Geçersiz sayfa imleci' });
  }
  return Number(raw);
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

@Injectable()
export class MessagingService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly push: PushService,
  ) {}

  // ---- Konuşma başlatma ----

  /**
   * Kim kime yazabilir:
   *  - Var olan konuşmada her iki taraf
   *  - Onaylı danışmana herkes (yönetici hariç)
   *  - Danışman, kendisine ilgi göstermiş mülk sahibine
   */
  async start(me: Viewer, dto: StartConversationDto) {
    if (dto.userId === me.id) {
      throw new BadRequestException({ code: 'SELF_MESSAGE', message: 'Kendine mesaj gönderemezsin' });
    }
    if (me.role === 'admin') throw new ForbiddenException('Yönetici hesabı mesajlaşamaz');
    const [target] = await this.db
      .select({ id: users.id, role: users.role, status: users.status, verification: agentProfiles.verificationStatus })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, dto.userId))
      .limit(1);
    if (!target || target.status !== 'active' || target.role === 'admin' || !target.role) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const existing = await this.findByPair(this.db, me.id, target.id);
    if (!existing) {
      const targetIsAgent = target.role === 'agent' && target.verification === 'approved';
      const hasInterest =
        me.role === 'agent' &&
        (await this.db
          .select({ id: interests.id })
          .from(interests)
          .where(and(eq(interests.requesterId, target.id), eq(interests.ownerId, me.id)))
          .limit(1)).length > 0;
      if (!targetIsAgent && !hasInterest) {
        throw new ForbiddenException({ code: 'CANNOT_MESSAGE', message: 'Bu kullanıcıya mesaj gönderemezsin' });
      }
    }

    const conversationId = await this.db.transaction(async (tx) => {
      const id = existing?.id ?? (await this.ensure(tx, me.id, target.id));
      if (dto.listingId) await this.insert(tx, id, me, { listingId: dto.listingId });
      if (dto.text?.trim()) await this.insert(tx, id, me, { text: dto.text });
      return id;
    });
    if (dto.text?.trim()) await this.notifyOther(conversationId, me.id, dto.text);
    return this.summary(me.id, conversationId);
  }

  /** Eşleşmede (ilgi kabul) konuşmayı açar ve sistem mesajı ekler */
  async onMatch(tx: Tx, ownerId: string, requesterId: string, listingId: string, title: string) {
    const id = await this.ensure(tx, ownerId, requesterId);
    await tx.insert(messages).values({
      conversationId: id,
      senderId: null,
      kind: 'system',
      body: `"${title}" ilanı için eşleştiniz. Artık mesajlaşabilirsiniz.`,
      listingId,
    });
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, id));
    return id;
  }

  // ---- Mesajlar ----

  async send(me: Viewer, conversationId: string, dto: SendMessageDto) {
    await this.requireParticipant(me.id, conversationId);
    if (!dto.text?.trim() && !dto.listingId) {
      throw new BadRequestException({ code: 'EMPTY_MESSAGE', message: 'Mesaj boş olamaz' });
    }
    const created = await this.db.transaction(async (tx) => {
      const out = [];
      if (dto.listingId) out.push(await this.insert(tx, conversationId, me, { listingId: dto.listingId }));
      if (dto.text?.trim()) out.push(await this.insert(tx, conversationId, me, { text: dto.text }));
      return out;
    });
    await this.notifyOther(conversationId, me.id, dto.text?.trim() || 'Bir ilan paylaştı');
    return this.decorate(me, created);
  }

  /**
   * Sayfalı mesajlar: varsayılan en yeniden geriye (`cursor`); `after` ile
   * yalnızca yeni gelenler (yoklama).
   */
  async list(me: Viewer, conversationId: string, q: MessagesQuery) {
    await this.requireParticipant(me.id, conversationId);
    const limit = q.limit ?? 30;
    const conds: SQL[] = [eq(messages.conversationId, conversationId)];
    if (q.after) {
      conds.push(gt(messages.seq, seqOf(q.after)));
      const rows = await this.db
        .select()
        .from(messages)
        .where(and(...conds))
        .orderBy(asc(messages.seq))
        .limit(200);
      return { items: await this.decorate(me, rows), nextCursor: null };
    }
    if (q.cursor) conds.push(lt(messages.seq, seqOf(q.cursor)));
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conds))
      .orderBy(desc(messages.seq))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const oldest = page.at(-1);
    return {
      // Ekranda eskiden yeniye gösterilir
      items: await this.decorate(me, page.reverse()),
      nextCursor: rows.length > limit && oldest ? String(oldest.seq) : null,
    };
  }

  async markRead(userId: string, conversationId: string) {
    await this.requireParticipant(userId, conversationId);
    await this.db
      .update(conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)),
      );
    return { ok: true };
  }

  // ---- Konuşma listesi ----

  async conversations(userId: string) {
    const ids = await this.db
      .select({ id: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));
    if (ids.length === 0) return [];
    return this.summaries(userId, ids.map((r) => r.id));
  }

  async summary(userId: string, conversationId: string) {
    const [row] = await this.summaries(userId, [conversationId]);
    if (!row) throw new NotFoundException('Konuşma bulunamadı');
    return row;
  }

  /** Okunmamış mesaj içeren konuşma sayısı (rozet) */
  async unread(userId: string) {
    const { rows } = await this.db.execute<{ conversations: number; messages: number }>(sql`
      select count(distinct m.conversation_id)::int as conversations, count(*)::int as messages
      from conversation_participants p
      join messages m on m.conversation_id = p.conversation_id
      where p.user_id = ${userId}
        and (m.sender_id is distinct from ${userId})
        and m.created_at > coalesce(p.last_read_at, 'epoch'::timestamptz)
    `);
    return rows[0] ?? { conversations: 0, messages: 0 };
  }

  /** İki kullanıcı arasındaki konuşma (yoksa null) */
  async withUser(meId: string, otherId: string) {
    const c = await this.findByPair(this.db, meId, otherId);
    return c ? this.summary(meId, c.id) : null;
  }

  // ---- Yardımcılar ----

  private async summaries(userId: string, ids: string[]) {
    const { rows } = await this.db.execute<{
      id: string;
      last_message_at: Date | null;
      other_id: string;
      other_name: string | null;
      other_role: string | null;
      other_verified: boolean;
      other_office: string | null;
      last_body: string | null;
      last_kind: string | null;
      last_sender: string | null;
      last_at: Date | null;
      unread: number;
    }>(sql`
      select c.id, c.last_message_at,
        o.user_id as other_id, u.full_name as other_name, u.role as other_role,
        coalesce(ap.verification_status = 'approved', false) as other_verified,
        (select ofc.name from office_memberships om join offices ofc on ofc.id = om.office_id
          where om.user_id = o.user_id and om.status = 'active' and ofc.status = 'active' limit 1) as other_office,
        lm.body as last_body, lm.kind as last_kind, lm.sender_id as last_sender, lm.created_at as last_at,
        (select count(*)::int from messages m
          where m.conversation_id = c.id and m.sender_id is distinct from ${userId}
            and m.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)) as unread
      from conversations c
      join conversation_participants me on me.conversation_id = c.id and me.user_id = ${userId}
      join conversation_participants o on o.conversation_id = c.id and o.user_id <> ${userId}
      join users u on u.id = o.user_id
      left join agent_profiles ap on ap.user_id = o.user_id
      left join lateral (
        select m.body, m.kind, m.sender_id, m.created_at from messages m
        where m.conversation_id = c.id order by m.seq desc limit 1
      ) lm on true
      where c.id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
      order by coalesce(c.last_message_at, c.created_at) desc
    `);
    return rows.map((r) => ({
      id: r.id,
      other: {
        id: r.other_id,
        fullName: r.other_name,
        isAgent: r.other_role === 'agent',
        isVerified: r.other_verified,
        officeName: r.other_office,
      },
      lastMessage: r.last_at
        ? {
            body: r.last_body!,
            kind: r.last_kind as 'text' | 'listing' | 'system',
            mine: r.last_sender === userId,
            createdAt: new Date(r.last_at),
          }
        : null,
      unread: r.unread,
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at) : null,
    }));
  }

  private async insert(tx: Tx, conversationId: string, me: Viewer, m: { text?: string; listingId?: string }) {
    let values: typeof messages.$inferInsert;
    if (m.listingId) {
      // Paylaşılan ilan gönderenin görebildiği yayındaki bir ilan olmalı
      const [l] = await tx
        .select({ id: listings.id, title: listings.title })
        .from(listings)
        .where(and(eq(listings.id, m.listingId), or(eq(listings.ownerId, me.id), and(eq(listings.status, 'active'), visibleTo(me)))))
        .limit(1);
      if (!l) throw new NotFoundException('İlan bulunamadı');
      values = { conversationId, senderId: me.id, kind: 'listing', body: l.title, listingId: l.id };
    } else {
      values = { conversationId, senderId: me.id, kind: 'text', body: m.text!.trim() };
    }
    const [row] = await tx.insert(messages).values(values).returning();
    await tx.update(conversations).set({ lastMessageAt: row.createdAt }).where(eq(conversations.id, conversationId));
    // Kendi mesajı okunmuş sayılır
    await tx
      .update(conversationParticipants)
      .set({ lastReadAt: row.createdAt })
      .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, me.id)));
    return row;
  }

  /** Mesajlara ilan kartı ekler; görüntüleyen artık göremiyorsa kart boş gelir */
  private async decorate(me: Viewer, rows: (typeof messages.$inferSelect)[]) {
    const listingIds = [...new Set(rows.map((r) => r.listingId).filter((x): x is string => !!x))];
    const cards = new Map<string, unknown>();
    if (listingIds.length > 0) {
      const ls = await this.db
        .select({
          id: listings.id,
          title: listings.title,
          price: listings.price,
          dealType: listings.dealType,
          status: listings.status,
          coverPhotoId: sql<string | null>`(select p.id from listing_photos p where p.listing_id = "listings"."id" order by p.position limit 1)`,
        })
        .from(listings)
        .where(
          and(
            inArray(listings.id, listingIds),
            or(eq(listings.ownerId, me.id), and(eq(listings.status, 'active'), visibleTo(me))),
          ),
        );
      for (const l of ls) {
        cards.set(l.id, {
          id: l.id,
          title: l.title,
          price: l.price,
          dealType: l.dealType,
          status: l.status,
          coverPhoto: l.coverPhotoId ? photoPath(l.id, l.coverPhotoId) : null,
        });
      }
    }
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      senderId: r.senderId,
      mine: r.senderId === me.id,
      createdAt: r.createdAt,
      cursor: String(r.seq),
      listing: r.listingId ? (cards.get(r.listingId) ?? null) : null,
    }));
  }

  private async notifyOther(conversationId: string, senderId: string, text: string) {
    const [other] = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.conversationId, conversationId), ne(conversationParticipants.userId, senderId)));
    const [me] = await this.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, senderId));
    if (!other) return;
    this.push.dispatch([other.userId], {
      title: me?.fullName ?? 'Yeni mesaj',
      body: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      data: { type: 'message', conversationId },
    });
  }

  private async ensure(tx: Conn, a: string, b: string) {
    const key = pairKey(a, b);
    await tx.insert(conversations).values({ pairKey: key }).onConflictDoNothing();
    const [c] = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.pairKey, key));
    await tx
      .insert(conversationParticipants)
      .values([
        { conversationId: c.id, userId: a },
        { conversationId: c.id, userId: b },
      ])
      .onConflictDoNothing();
    return c.id;
  }

  private async findByPair(conn: Conn, a: string, b: string) {
    const [c] = await conn
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.pairKey, pairKey(a, b)))
      .limit(1);
    return c ?? null;
  }

  private async requireParticipant(userId: string, conversationId: string) {
    const [p] = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(
        and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)),
      )
      .limit(1);
    if (!p) throw new NotFoundException('Konuşma bulunamadı');
  }
}

