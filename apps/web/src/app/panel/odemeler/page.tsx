"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/components/app-shell";
import { PayoutAccountCard } from "@/components/payout-account";
import { Alert, EmptyState, Eyebrow, Spinner } from "@/components/ui";
import { api, type PaymentRequestView, type PaymentStatus, type PaymentSummary } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { formatKurus, PAYMENT_STATUS_LABEL } from "@/lib/listing";

const TONE: Record<PaymentStatus, string> = {
  open: "bg-warn-tint text-warn",
  paid: "bg-ok-tint text-ok",
  cancelled: "border border-line bg-paper text-ink-soft",
  expired: "border border-line bg-paper text-ink-soft",
  refunded: "bg-brand-tint text-brand-ink",
};

export default function PaymentsPage() {
  const { me } = useMe();
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const isAgent = me.role === "agent" && !!me.agent?.isVerified;
  const summary = useQuery({
    queryKey: ["payment-summary"],
    queryFn: () => api<PaymentSummary>("/payments/summary"),
    enabled: isAgent,
  });
  const list = useQuery({
    queryKey: ["payment-requests", status],
    queryFn: () => api<PaymentRequestView[]>(`/payments/requests${status ? `?status=${status}` : ""}`),
    enabled: isAgent,
  });

  if (!isAgent) return <Alert>Komisyon tahsilatı onaylı danışmanlar içindir.</Alert>;

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Tahsilat</Eyebrow>
          <h1 className="text-3xl font-extrabold tracking-tight">Ödemeler</h1>
          <p className="mt-1 text-ink-soft">Komisyonunu kartla tahsil et; paylaşımlı işlemde pay otomatik bölünür.</p>
        </div>
        <Link
          href="/panel/odemeler/yeni"
          className="inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-ink"
        >
          + Ödeme talebi
        </Link>
      </div>

      {summary.data && (
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ["Hesabına aktarılan", summary.data.settled, "text-ok"],
              ["Aktarım bekleyen", summary.data.pending, ""],
              ["IBAN bekleyen", summary.data.held, "text-warn"],
              ["Açık talepler", summary.data.openRequests, ""],
            ] as const
          ).map(([label, v, tone]) => (
            <div key={label} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold text-ink-soft">{label}</p>
              <p className={`mt-1 text-xl font-extrabold tabular-nums ${tone}`}>{formatKurus(v)}</p>
            </div>
          ))}
        </div>
      )}

      <PayoutAccountCard />

      <section className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <button className={chip(status === "")} onClick={() => setStatus("")}>
            Tümü
          </button>
          {(["open", "paid", "expired", "cancelled"] as PaymentStatus[]).map((s) => (
            <button key={s} className={chip(status === s)} onClick={() => setStatus(s)}>
              {PAYMENT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {list.isError ? (
          <Alert tone="error">{list.error.message}</Alert>
        ) : !list.data ? (
          <Spinner />
        ) : list.data.length === 0 ? (
          <EmptyState>Henüz ödeme talebi yok.</EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {list.data.map((r) => (
              <li key={r.id}>
                <Link href={`/panel/odemeler/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-paper/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.description}</p>
                    <p className="text-sm text-ink-soft">
                      {r.role === "seller" ? `Ödeyen: ${r.payer.name}` : `Paylaşımlı · ${r.seller.fullName}`} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold tabular-nums">{formatKurus(r.amount)}</p>
                    <p className="text-xs text-ink-soft">Payın {formatKurus(r.myShare)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE[r.status]}`}>
                    {PAYMENT_STATUS_LABEL[r.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
