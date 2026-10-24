import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import { AuditService } from '../common/audit.service.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { activeOfficeOf } from '../db/queries.js';
import {
  agentProfiles,
  invoices,
  listings,
  paymentEvents,
  paymentRequests,
  paymentSplits,
  payoutAccounts,
  users,
  type PaymentRequest,
} from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreatePaymentRequestDto, PaymentListQuery, PayoutAccountDto } from './dto.js';
import { isValidTckn, isValidVkn, maskIban, normalizeIban, splitAmount, vatFromGross } from './money.js';
import { PaymentProvider, type ProviderEvent } from './provider.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const tl = (kurus: number) =>
  `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kurus / 100)} ₺`;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly provider: PaymentProvider,
    private readonly config: ConfigService<Env, true>,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Ödeme alacak hesap ----

  async payoutAccount(userId: string) {
    const [row] = await this.db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId));
    if (!row) return null;
    return {
      holderName: row.holderName,
      iban: maskIban(row.iban),
      taxIdLast4: row.taxId.slice(-4),
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }

  async upsertPayoutAccount(userId: string, dto: PayoutAccountDto) {
    await this.requireApprovedAgent(userId);
    const iban = normalizeIban(dto.iban);
    if (!iban) throw new BadRequestException({ code: 'INVALID_IBAN', message: 'Geçerli bir TR IBAN girin' });
    const taxOk = dto.taxId.length === 11 ? isValidTckn(dto.taxId) : isValidVkn(dto.taxId);
    if (!taxOk) throw new BadRequestException({ code: 'INVALID_TAX_ID', message: 'TCKN/VKN doğrulanamadı' });

    const sub = await this.provider.registerSubMerchant({
      userId,
      holderName: dto.holderName.trim(),
      iban,
      taxId: dto.taxId,
    });
    const values = {
      holderName: dto.holderName.trim(),
      iban,
      taxId: dto.taxId,
      status: sub.status,
      providerRef: sub.ref,
    };
    await this.db
      .insert(payoutAccounts)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: payoutAccounts.userId, set: { ...values, updatedAt: new Date() } });
    await this.audit.log({ actorId: userId, action: 'payout_account.updated', targetType: 'user', targetId: userId });
    // Hesabı olmadığı için bekletilen payları serbest bırak
    if (sub.status === 'verified') await this.releaseHeld(userId);
    return this.payoutAccount(userId);
  }

  // ---- Ödeme talepleri ----

  async create(userId: string, dto: CreatePaymentRequestDto) {
    await this.requireApprovedAgent(userId);
    const [account] = await this.db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId));
    if (account?.status !== 'verified') {
      throw new BadRequestException({
        code: 'PAYOUT_ACCOUNT_REQUIRED',
        message: 'Ödeme almak için önce onaylı bir IBAN hesabı ekleyin',
      });
    }

    let cobroke: number | null = null;
    if (dto.listingId) {
      const [l] = await this.db
        .select({ ownerId: listings.ownerId, cobrokeShare: listings.cobrokeShare })
        .from(listings)
        .where(eq(listings.id, dto.listingId));
      if (!l || l.ownerId !== userId) throw new NotFoundException('İlan bulunamadı');
      cobroke = l.cobrokeShare;
    }
    let buyerShare = 0;
    if (dto.buyerAgentId) {
      if (dto.buyerAgentId === userId) {
        throw new BadRequestException({ code: 'SELF_BUYER_AGENT', message: 'Alıcı danışman siz olamazsınız' });
      }
      await this.requireApprovedAgent(dto.buyerAgentId, 'Alıcı danışman bulunamadı');
      buyerShare = dto.buyerShare ?? cobroke ?? 50;
    } else if (dto.buyerShare) {
      throw new BadRequestException({ code: 'BUYER_AGENT_REQUIRED', message: 'Pay için alıcı danışmanı seçin' });
    }

    const days = this.config.get('PAYMENT_LINK_DAYS', { infer: true });
    const [row] = await this.db
      .insert(paymentRequests)
      .values({
        publicToken: randomBytes(24).toString('base64url'),
        createdBy: userId,
        listingId: dto.listingId ?? null,
        buyerAgentId: dto.buyerAgentId ?? null,
        buyerShare,
        payerName: dto.payerName.trim(),
        payerPhone: dto.payerPhone ?? null,
        payerEmail: dto.payerEmail?.toLowerCase() ?? null,
        description: dto.description.trim(),
        amount: dto.amount,
        platformFeeBps: this.config.get('PLATFORM_FEE_BPS', { infer: true }),
        expiresAt: new Date(Date.now() + days * 86_400_000),
        provider: this.provider.name,
      })
      .returning();

    if (row.buyerAgentId) {
      const [me] = await this.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId));
      const share = splitAmount(row.amount, row.platformFeeBps, row.buyerShare).buyer;
      await this.notifications.notify({
        userId: row.buyerAgentId,
        type: 'payment.request_created',
        title: 'Paylaşımlı ödeme talebi',
        body: `${me?.fullName ?? 'Bir danışman'} ${tl(row.amount)} komisyon talebi oluşturdu; payın ${tl(share)}`,
        data: { requestId: row.id },
      });
    }
    await this.audit.log({ actorId: userId, action: 'payment_request.created', targetType: 'payment_request', targetId: row.id });
    return this.detail(userId, row.id);
  }

  async list(userId: string, q: PaymentListQuery) {
    await this.expireDue();
    const conds: SQL[] = [or(eq(paymentRequests.createdBy, userId), eq(paymentRequests.buyerAgentId, userId))!];
    if (q.status) conds.push(eq(paymentRequests.status, q.status));
    const rows = await this.db
      .select()
      .from(paymentRequests)
      .where(and(...conds))
      .orderBy(desc(paymentRequests.createdAt))
      .limit(100);
    return Promise.all(rows.map((r) => this.view(userId, r)));
  }

  async detail(userId: string, id: string) {
    await this.expireDue();
    const [row] = await this.db.select().from(paymentRequests).where(eq(paymentRequests.id, id));
    if (!row || (row.createdBy !== userId && row.buyerAgentId !== userId)) {
      throw new NotFoundException('Ödeme talebi bulunamadı');
    }
    return this.view(userId, row);
  }

  async cancel(userId: string, id: string) {
    const [row] = await this.db.select().from(paymentRequests).where(eq(paymentRequests.id, id));
    if (!row || row.createdBy !== userId) throw new NotFoundException('Ödeme talebi bulunamadı');
    if (row.status !== 'open') {
      throw new ConflictException({ code: 'NOT_OPEN', message: 'Yalnızca açık talep iptal edilebilir' });
    }
    await this.db
      .update(paymentRequests)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(paymentRequests.id, id), eq(paymentRequests.status, 'open')));
    await this.audit.log({ actorId: userId, action: 'payment_request.cancelled', targetType: 'payment_request', targetId: id });
    return this.detail(userId, id);
  }

  /** Danışmanın kazanç özeti (kuruş) */
  async summary(userId: string) {
    const { rows } = await this.db.execute<{ settled: string; pending: string; held: string; open: string }>(sql`
      select
        coalesce(sum(s.amount) filter (where s.payout_status = 'settled'), 0) as settled,
        coalesce(sum(s.amount) filter (where s.payout_status = 'pending'), 0) as pending,
        coalesce(sum(s.amount) filter (where s.payout_status = 'held'), 0) as held,
        (select coalesce(sum(r.amount), 0) from payment_requests r
          where r.created_by = ${userId} and r.status = 'open' and r.expires_at > now()) as open
      from payment_splits s where s.user_id = ${userId}
    `);
    const r = rows[0]!;
    return { settled: Number(r.settled), pending: Number(r.pending), held: Number(r.held), openRequests: Number(r.open) };
  }

  // ---- Herkese açık ödeme sayfası ----

  async publicView(token: string) {
    const row = await this.byToken(token);
    const [agent] = await this.db
      .select({ fullName: users.fullName, verification: agentProfiles.verificationStatus })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, row.createdBy));
    const office = await activeOfficeOf(this.db, row.createdBy);
    return {
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      payerName: row.payerName,
      expiresAt: row.expiresAt,
      paidAt: row.paidAt,
      payee: {
        fullName: agent?.fullName ?? 'Danışman',
        isVerified: agent?.verification === 'approved',
        officeName: office?.status === 'active' ? office.name : null,
      },
      provider: row.provider,
    };
  }

  async checkout(token: string) {
    const row = await this.byToken(token);
    if (row.status !== 'open') {
      throw new ConflictException({ code: 'NOT_OPEN', message: 'Bu ödeme bağlantısı artık geçerli değil' });
    }
    const split = splitAmount(row.amount, row.platformFeeBps, row.buyerShare);
    const refs = await this.subMerchantRefs([row.createdBy, row.buyerAgentId].filter((x): x is string => !!x));
    const session = await this.provider.createCheckout({
      requestId: row.id,
      publicToken: row.publicToken,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      payer: { name: row.payerName, email: row.payerEmail, phone: row.payerPhone },
      splits: [
        { subMerchantRef: refs.get(row.createdBy) ?? null, amount: split.seller },
        ...(row.buyerAgentId ? [{ subMerchantRef: refs.get(row.buyerAgentId) ?? null, amount: split.buyer }] : []),
      ],
      returnUrl: `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/odeme/${row.publicToken}`,
    });
    await this.db
      .update(paymentRequests)
      .set({ providerSessionId: session.sessionId })
      .where(eq(paymentRequests.id, row.id));
    return { redirectUrl: session.redirectUrl, sessionId: session.sessionId };
  }

  // ---- Sağlayıcı bildirimi ----

  async handleWebhook(providerName: string, rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>) {
    if (providerName !== this.provider.name || !rawBody) throw new NotFoundException();
    const event = this.provider.parseWebhook(rawBody, headers);
    if (!event) throw new UnauthorizedException({ code: 'BAD_SIGNATURE', message: 'İmza doğrulanamadı' });
    return this.process(event);
  }

  /** Olayı bir kez işler (aynı olay tekrar gelirse yok sayılır) */
  async process(event: ProviderEvent) {
    const [req] = await this.db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.providerSessionId, event.sessionId));

    const outcome = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(paymentEvents)
        .values({
          provider: this.provider.name,
          eventId: event.id,
          type: event.type,
          payload: event.raw,
          requestId: req?.id ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: paymentEvents.id });
      if (inserted.length === 0) return 'duplicate' as const;
      if (!req) {
        this.logger.warn(`Bilinmeyen ödeme oturumu: ${event.sessionId}`);
        return 'unknown_session' as const;
      }
      if (event.type === 'payment.failed') return 'failed' as const;

      // Ödeme alınmışsa iptal/süresi geçmiş olsa da kayıt "ödendi" olur (para tahsil edildi)
      const updated = await tx
        .update(paymentRequests)
        .set({ status: 'paid', paidAt: new Date(), providerPaymentId: event.paymentId })
        .where(and(eq(paymentRequests.id, req.id), inArray(paymentRequests.status, ['open', 'expired', 'cancelled'])))
        .returning();
      if (updated.length === 0) return 'already_paid' as const;
      await this.settle(tx, updated[0]!);
      return 'paid' as const;
    });
    return { received: true, outcome };
  }

  /** Paylaşımları yazar, platform faturasını kaydeder, taraflara bildirir */
  private async settle(tx: Tx, r: PaymentRequest) {
    const split = splitAmount(r.amount, r.platformFeeBps, r.buyerShare);
    const accounts = await this.subMerchantRefs([r.createdBy, r.buyerAgentId].filter((x): x is string => !!x), tx);
    const now = new Date();
    // Pazaryeri modelinde sağlayıcı alt üye işyerine aktarır; hesap yoksa pay bekletilir
    const status = (userId: string) => (accounts.has(userId) ? 'settled' : 'held') as 'settled' | 'held';
    const rows: (typeof paymentSplits.$inferInsert)[] = [
      { requestId: r.id, kind: 'platform', userId: null, amount: split.platform, payoutStatus: 'settled', settledAt: now },
      {
        requestId: r.id,
        kind: 'seller_agent',
        userId: r.createdBy,
        amount: split.seller,
        payoutStatus: status(r.createdBy),
        settledAt: status(r.createdBy) === 'settled' ? now : null,
      },
    ];
    if (r.buyerAgentId && split.buyer > 0) {
      rows.push({
        requestId: r.id,
        kind: 'buyer_agent',
        userId: r.buyerAgentId,
        amount: split.buyer,
        payoutStatus: status(r.buyerAgentId),
        settledAt: status(r.buyerAgentId) === 'settled' ? now : null,
      });
    }
    await tx.insert(paymentSplits).values(rows);

    if (split.platform > 0) {
      const v = vatFromGross(split.platform, this.config.get('VAT_RATE_BPS', { infer: true }));
      await tx.insert(invoices).values({
        requestId: r.id,
        userId: r.createdBy,
        net: v.net,
        vat: v.vat,
        total: v.total,
        vatRateBps: this.config.get('VAT_RATE_BPS', { infer: true }),
      });
    }

    await this.notifications.notify(
      [
        {
          userId: r.createdBy,
          type: 'payment.paid',
          title: 'Ödeme alındı',
          body: `${r.payerName} ${tl(r.amount)} ödedi; payın ${tl(split.seller)}`,
          data: { requestId: r.id },
        },
        ...(r.buyerAgentId && split.buyer > 0
          ? [
              {
                userId: r.buyerAgentId,
                type: 'payment.paid' as const,
                title: 'Paylaşımlı ödeme alındı',
                body: accounts.has(r.buyerAgentId)
                  ? `Payın ${tl(split.buyer)} hesabına aktarılıyor`
                  : `Payın ${tl(split.buyer)} — aktarım için IBAN hesabı ekle`,
                data: { requestId: r.id },
              },
            ]
          : []),
      ],
      tx,
    );
  }

  private async releaseHeld(userId: string) {
    await this.db
      .update(paymentSplits)
      .set({ payoutStatus: 'settled', settledAt: new Date() })
      .where(and(eq(paymentSplits.userId, userId), eq(paymentSplits.payoutStatus, 'held')));
  }

  // ---- Yardımcılar ----

  private async view(userId: string, r: PaymentRequest) {
    const split = splitAmount(r.amount, r.platformFeeBps, r.buyerShare);
    const ids = [r.createdBy, r.buyerAgentId].filter((x): x is string => !!x);
    const people = await this.db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, ids));
    const name = (id: string | null) => (id ? (people.find((p) => p.id === id)?.fullName ?? null) : null);
    const [listing] = r.listingId
      ? await this.db.select({ id: listings.id, title: listings.title }).from(listings).where(eq(listings.id, r.listingId))
      : [];
    const splits =
      r.status === 'paid'
        ? await this.db
            .select({ kind: paymentSplits.kind, amount: paymentSplits.amount, payoutStatus: paymentSplits.payoutStatus })
            .from(paymentSplits)
            .where(eq(paymentSplits.requestId, r.id))
        : [];
    const isCreator = r.createdBy === userId;
    return {
      id: r.id,
      role: isCreator ? ('seller' as const) : ('buyer' as const),
      status: r.status,
      amount: r.amount,
      currency: r.currency,
      description: r.description,
      // Ödeyen bilgisi yalnızca talebi oluşturana
      payer: isCreator ? { name: r.payerName, phone: r.payerPhone, email: r.payerEmail } : { name: r.payerName },
      listing: listing ?? null,
      seller: { id: r.createdBy, fullName: name(r.createdBy) },
      buyerAgent: r.buyerAgentId ? { id: r.buyerAgentId, fullName: name(r.buyerAgentId) } : null,
      buyerShare: r.buyerShare,
      breakdown: { platformFee: split.platform, seller: split.seller, buyer: split.buyer, platformFeeBps: r.platformFeeBps },
      myShare: isCreator ? split.seller : split.buyer,
      payouts: splits,
      link: isCreator ? `${this.config.get('PUBLIC_WEB_URL', { infer: true })}/odeme/${r.publicToken}` : null,
      expiresAt: r.expiresAt,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
    };
  }

  /** Süresi dolan açık talepleri kapatır (okuma sırasında; zamanlayıcı gerekmez) */
  private async expireDue() {
    await this.db
      .update(paymentRequests)
      .set({ status: 'expired' })
      .where(and(eq(paymentRequests.status, 'open'), sql`${paymentRequests.expiresAt} <= now()`));
  }

  private async byToken(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException('Ödeme bağlantısı bulunamadı');
    await this.expireDue();
    const [row] = await this.db.select().from(paymentRequests).where(eq(paymentRequests.publicToken, token));
    if (!row) throw new NotFoundException('Ödeme bağlantısı bulunamadı');
    return row;
  }

  private async subMerchantRefs(userIds: string[], conn: Database | Tx = this.db) {
    if (userIds.length === 0) return new Map<string, string>();
    const rows = await conn
      .select({ userId: payoutAccounts.userId, ref: payoutAccounts.providerRef })
      .from(payoutAccounts)
      .where(and(inArray(payoutAccounts.userId, userIds), eq(payoutAccounts.status, 'verified')));
    return new Map(rows.filter((r) => r.ref).map((r) => [r.userId, r.ref!]));
  }

  private async requireApprovedAgent(userId: string, message = 'Ödeme işlemleri onaylı danışmanlar içindir') {
    const [row] = await this.db
      .select({ role: users.role, status: users.status, v: agentProfiles.verificationStatus })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, userId));
    if (!row || row.role !== 'agent' || row.status !== 'active' || row.v !== 'approved') {
      if (message.startsWith('Alıcı')) throw new NotFoundException(message);
      throw new ForbiddenException(message);
    }
  }
}
