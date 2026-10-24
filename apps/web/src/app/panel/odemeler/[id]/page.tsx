"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Eyebrow, Spinner } from "@/components/ui";
import { api, type PaymentRequestView } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { formatKurus, PAYMENT_STATUS_LABEL } from "@/lib/listing";
import { useAction } from "@/lib/use-action";

const PAYOUT_LABEL = { pending: "Aktarılıyor", settled: "Aktarıldı", held: "IBAN bekliyor", failed: "Başarısız" };
const KIND_LABEL = { platform: "Emlook hizmet bedeli", seller_agent: "İlan danışmanı", buyer_agent: "Alıcı danışmanı" };

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ["payment-request", id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<PaymentRequestView>(`/payments/requests/${id}`),
    // Ödeme bekleniyorsa durum kendiliğinden tazelenir
    refetchInterval: (query) => (query.state.data?.status === "open" ? 10_000 : false),
  });
  const action = useAction();
  const [copied, setCopied] = useState(false);

  const r = q.data;
  if (!r) return q.isError ? <Alert tone="error">{q.error.message}</Alert> : <Spinner />;

  async function copy() {
    if (!r?.link) return;
    try {
      await navigator.clipboard.writeText(r.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano izni yoksa kullanıcı bağlantıyı elle kopyalar
    }
  }

  const whatsapp = r.link
    ? `https://wa.me/?text=${encodeURIComponent(`${r.description} — ${formatKurus(r.amount)}\nÖdeme bağlantısı: ${r.link}`)}`
    : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/panel/odemeler" className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← Ödemeler
        </Link>
        <Eyebrow>{PAYMENT_STATUS_LABEL[r.status]}</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">{r.description}</h1>
        <p className="mt-1 text-2xl font-extrabold tabular-nums">{formatKurus(r.amount)}</p>
        <p className="mt-1 text-sm text-ink-soft">
          Oluşturuldu {formatDate(r.createdAt)}
          {r.status === "open" && ` · Son geçerlilik ${formatDate(r.expiresAt)}`}
          {r.paidAt && ` · Ödendi ${formatDate(r.paidAt)}`}
        </p>
      </div>

      {action.error && <Alert tone="error">{action.error}</Alert>}

      {r.status === "open" && r.link && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-6">
          <h2 className="font-bold">Ödeme bağlantısı</h2>
          <p className="break-all rounded-xl bg-paper px-4 py-3 font-mono text-sm">{r.link}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>{copied ? "Kopyalandı" : "Bağlantıyı kopyala"}</Button>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold hover:border-ink-soft"
              >
                WhatsApp ile gönder
              </a>
            )}
            <Button
              variant="danger"
              loading={action.busy === "cancel"}
              onClick={() => {
                if (!confirm("Ödeme talebi iptal edilsin mi? Bağlantı geçersiz olur.")) return;
                void action.run("cancel", async () => {
                  qc.setQueryData(key, await api<PaymentRequestView>(`/payments/requests/${id}/cancel`, { method: "POST" }));
                  void qc.invalidateQueries({ queryKey: ["payment-requests"] });
                });
              }}
            >
              İptal et
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-bold">Bölüşüm</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Line label={`Emlook hizmet bedeli (%${(r.breakdown.platformFeeBps / 100).toLocaleString("tr-TR")})`} v={r.breakdown.platformFee} />
          <Line label={`İlan danışmanı · ${r.seller.fullName}`} v={r.breakdown.seller} strong={r.role === "seller"} />
          {r.buyerAgent && (
            <Line label={`Alıcı danışmanı · ${r.buyerAgent.fullName} (%${r.buyerShare})`} v={r.breakdown.buyer} strong={r.role === "buyer"} />
          )}
        </dl>
        {r.payouts.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {r.payouts.map((p) => (
              <li key={p.kind} className="flex justify-between gap-3">
                <span className="text-ink-soft">{KIND_LABEL[p.kind]}</span>
                <span className={p.payoutStatus === "settled" ? "font-semibold text-ok" : "font-semibold text-warn"}>
                  {PAYOUT_LABEL[p.payoutStatus]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6 text-sm">
        <h2 className="font-bold">Ödeyen</h2>
        <p className="mt-2">{r.payer.name}</p>
        {r.payer.phone && <p className="text-ink-soft">{r.payer.phone}</p>}
        {r.payer.email && <p className="text-ink-soft">{r.payer.email}</p>}
        {r.listing && (
          <p className="mt-3">
            İlan:{" "}
            <Link href={`/ilan/${r.listing.id}`} className="font-semibold text-brand hover:underline">
              {r.listing.title}
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

function Line({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-ink-soft"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-extrabold" : "font-semibold"}`}>{formatKurus(v)}</dd>
    </div>
  );
}
