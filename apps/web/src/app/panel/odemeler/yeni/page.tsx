"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMe } from "@/components/app-shell";
import { Avatar } from "@/components/social";
import { Alert, Button, Eyebrow, Field, Input, Textarea } from "@/components/ui";
import {
  api,
  type MyListings,
  type PaymentRequestView,
  type PaymentSummary,
  type PayoutAccount,
  type PersonCard,
} from "@/lib/api";
import { formatKurus, parseTl } from "@/lib/listing";

export default function NewPaymentPage() {
  const { me } = useMe();
  const router = useRouter();
  const summary = useQuery({ queryKey: ["payment-summary"], queryFn: () => api<PaymentSummary>("/payments/summary") });
  const account = useQuery({
    queryKey: ["payout-account"],
    queryFn: () => api<{ account: PayoutAccount | null }>("/me/payout-account"),
  });
  const listings = useQuery({
    queryKey: ["my-listings", "for-payment"],
    queryFn: () => api<MyListings>("/listings/mine?limit=100"),
  });

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [listingId, setListingId] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [buyer, setBuyer] = useState<PersonCard | null>(null);
  const [share, setShare] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const agents = useQuery({
    queryKey: ["search-agents", agentQuery],
    queryFn: () => api<PersonCard[]>(`/search/agents?q=${encodeURIComponent(agentQuery)}`),
    enabled: agentQuery.trim().length >= 2 && !buyer,
  });

  if (!me.agent?.isVerified) return <Alert>Komisyon tahsilatı onaylı danışmanlar içindir.</Alert>;
  if (account.data && account.data.account?.status !== "verified") {
    return (
      <Alert tone="warn" title="Önce IBAN hesabını ekle">
        Ödeme talebi oluşturmak için{" "}
        <Link href="/panel/odemeler" className="font-semibold underline">
          ödemeler sayfasından
        </Link>{" "}
        onaylı bir hesap ekle.
      </Alert>
    );
  }

  const listing = listings.data?.items.find((l) => l.id === listingId);
  const kurus = parseTl(amount);
  const sharePct = buyer ? (share === "" ? (listing?.cobrokeShare ?? 50) : Number(share)) : 0;
  const fee = summary.data?.platformFeeBps ?? 0;
  const preview =
    kurus && kurus > 0
      ? (() => {
          const platform = Math.round((kurus * fee) / 10_000);
          const rest = kurus - platform;
          const b = Math.floor((rest * sharePct) / 100);
          return { platform, seller: rest - b, buyer: b };
        })()
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!kurus || kurus < 100) return setError("Geçerli bir tutar girin (en az 1 TL)");
    setSaving(true);
    try {
      const created = await api<PaymentRequestView>("/payments/requests", {
        json: {
          amount: kurus,
          description: description.trim(),
          payerName: payerName.trim(),
          payerPhone: payerPhone.replace(/\D/g, "") || undefined,
          payerEmail: payerEmail.trim() || undefined,
          listingId: listingId || undefined,
          buyerAgentId: buyer?.id,
          buyerShare: buyer && share !== "" ? Number(share) : undefined,
        },
      });
      router.push(`/panel/odemeler/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/panel/odemeler" className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← Ödemeler
        </Link>
        <Eyebrow>Yeni talep</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Komisyon ödeme talebi</h1>
        <p className="mt-1 text-ink-soft">
          Oluşan bağlantıyı müşterine gönder; kartla ödediğinde payın hesabına aktarılır.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tutar (₺, KDV dahil)">
              <Input required inputMode="decimal" placeholder="100.000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="İlgili ilan (isteğe bağlı)">
              <select
                className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] focus:border-ink focus:outline-none"
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
              >
                <option value="">Seçilmedi</option>
                {listings.data?.items
                  .filter((l) => l.status !== "draft")
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field label="Açıklama" hint="Ödeme sayfasında ve dekontta görünür">
            <Textarea required minLength={3} maxLength={200} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-lg font-bold">Ödeyen</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ad soyad">
              <Input required minLength={2} value={payerName} onChange={(e) => setPayerName(e.target.value)} />
            </Field>
            <Field label="Telefon (isteğe bağlı)">
              <Input inputMode="tel" placeholder="05XX XXX XX XX" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} />
            </Field>
            <Field label="E-posta (isteğe bağlı)">
              <Input type="email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-surface p-6">
          <div>
            <h2 className="text-lg font-bold">Paylaşımlı işlem</h2>
            <p className="text-sm text-ink-soft">Alıcıyı başka bir danışman getirdiyse payı otomatik ayrılır.</p>
          </div>
          {buyer ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              <Avatar name={buyer.fullName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{buyer.fullName}</p>
                <p className="text-xs text-ink-soft">{buyer.officeName ?? "Bağımsız"}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Pay %
                <Input
                  inputMode="numeric"
                  className="!h-10 !w-20 text-center"
                  placeholder={String(listing?.cobrokeShare ?? 50)}
                  value={share}
                  onChange={(e) => setShare(e.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </label>
              <button type="button" className="text-sm font-semibold text-ink-soft hover:text-brand" onClick={() => setBuyer(null)}>
                Kaldır
              </button>
            </div>
          ) : (
            <div>
              <Input placeholder="Danışman ara: ad, ofis…" value={agentQuery} onChange={(e) => setAgentQuery(e.target.value)} />
              {agents.data && agents.data.length > 0 && (
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {agents.data
                    .filter((p) => p.id !== me.id)
                    .slice(0, 5)
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setBuyer(p)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-paper"
                        >
                          <Avatar name={p.fullName} size={30} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{p.fullName}</span>
                            <span className="block text-xs text-ink-soft">{p.officeName ?? "Bağımsız"}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {preview && (
          <section className="rounded-2xl border border-line bg-paper p-6">
            <h2 className="font-bold">Bölüşüm önizlemesi</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label={`Emlook hizmet bedeli (%${(fee / 100).toLocaleString("tr-TR")})`} v={preview.platform} />
              <Row label="Senin payın" v={preview.seller} strong />
              {buyer && <Row label={`${buyer.fullName} (%${sharePct})`} v={preview.buyer} />}
              <div className="border-t border-line pt-1.5">
                <Row label="Ödeyenden tahsil edilecek" v={kurus!} strong />
              </div>
            </dl>
          </section>
        )}

        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Talep oluştur
          </Button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-extrabold" : "font-semibold"}`}>{formatKurus(v)}</dd>
    </div>
  );
}
