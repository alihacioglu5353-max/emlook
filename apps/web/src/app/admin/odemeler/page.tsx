"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { FilterTabs, PAGE_SIZE, Pagination } from "@/components/data-ui";
import { Alert, EmptyState, Spinner } from "@/components/ui";
import { api, type AdminDashboard, type AdminPaymentRow, type PaymentStatus } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { formatKurus, PAYMENT_STATUS_LABEL } from "@/lib/listing";

export default function AdminPayments() {
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [offset, setOffset] = useState(0);
  const dash = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api<AdminDashboard>("/admin/dashboard") });
  const q = useQuery({
    queryKey: ["admin-payments", status, offset],
    queryFn: () => api<{ items: AdminPaymentRow[]; total: number }>(`/admin/payments?limit=${PAGE_SIZE}&offset=${offset}${status ? `&status=${status}` : ""}`),
  });
  const d = dash.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-soft">Ödeme sağlayıcısı şu an test modunda; gerçek tahsilat Trinkle360 bağlanınca başlar.</p>
      </div>
      {d && (
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ["Tahsil edilen", formatKurus(d.paidVolume)],
              ["Platform geliri", formatKurus(d.platformRevenue)],
              ["IBAN bekleyen pay", formatKurus(d.heldPayouts)],
              ["Kesilecek fatura", String(d.pendingInvoices)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold text-ink-soft">{k}</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}
      <FilterTabs<PaymentStatus>
        value={status}
        options={(["paid", "open", "expired", "cancelled", "refunded"] as PaymentStatus[]).map((x) => [x, PAYMENT_STATUS_LABEL[x]])}
        onChange={(v) => { setStatus(v); setOffset(0); }}
      />
      {q.isError ? (
        <Alert tone="error">{q.error.message}</Alert>
      ) : !q.data ? (
        <Spinner />
      ) : q.data.items.length === 0 ? (
        <EmptyState>Kayıt yok.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">Talep</th>
                <th className="px-4 py-3">Danışman</th>
                <th className="px-4 py-3 text-right">Tutar</th>
                <th className="px-4 py-3 text-right">Platform</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Fatura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{p.description}</p>
                    <p className="text-xs text-ink-soft">
                      {p.payerName} · {formatDate(p.paidAt ?? p.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/kullanicilar/${p.seller.id}`} className="hover:underline">
                      {p.seller.fullName}
                    </Link>
                    {p.buyerAgent && (
                      <p className="text-xs text-ink-soft">
                        + {p.buyerAgent.fullName} (%{p.buyerShare})
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKurus(p.amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatKurus(p.platformFee)}</td>
                  <td className="px-4 py-3">{PAYMENT_STATUS_LABEL[p.status]}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {p.invoiceStatus === "pending" ? "Kesilecek" : p.invoiceStatus === "issued" ? "Kesildi" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && q.data.total > 0 && <Pagination total={q.data.total} offset={offset} onChange={setOffset} />}
    </div>
  );
}
