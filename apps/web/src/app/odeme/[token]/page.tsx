"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Button, Logo, Spinner, VerifiedIcon } from "@/components/ui";
import { api, type PublicPayment } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { formatKurus } from "@/lib/listing";

/** Oturum gerektirmeyen ödeme sayfası (müşteriye gönderilen bağlantı) */
export default function PayPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-paper px-4 py-10">
      <Logo />
      <main className="mt-8 w-full max-w-md">
        <Suspense fallback={<Spinner />}>
          <Pay />
        </Suspense>
      </main>
      <p className="mt-8 max-w-md text-center text-xs text-ink-soft">
        Ödemen Emlook üzerinden güvenli şekilde alınır; kart bilgilerin Emlook&apos;ta saklanmaz.
      </p>
    </div>
  );
}

function Pay() {
  const { token } = useParams<{ token: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const session = params.get("oturum");
  const qc = useQueryClient();
  const key = ["pay", token];
  const q = useQuery({ queryKey: key, queryFn: () => api<PublicPayment>(`/pay/${token}`) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.isError) return <Alert tone="error" title="Ödeme bağlantısı bulunamadı">{q.error.message}</Alert>;
  const p = q.data;
  if (!p) return <Spinner />;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ redirectUrl: string }>(`/pay/${token}/checkout`, { method: "POST" });
      // Gerçek sağlayıcıda harici ödeme sayfasına gidilir
      window.location.assign(res.redirectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function mock(outcome: "success" | "fail") {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ outcome: string }>(`/pay/${token}/mock-complete`, { json: { sessionId: session, outcome } });
      if (res.outcome === "failed") setError("Ödeme reddedildi. Kart bilgilerini kontrol edip tekrar dene.");
      router.replace(`/odeme/${token}`);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_10px_30px_-15px_rgba(22,23,28,0.3)]">
      <div className="space-y-1 p-6">
        <p className="text-sm text-ink-soft">Sayın {p.payerName},</p>
        <p className="text-lg font-semibold">{p.description}</p>
        <p className="pt-2 text-4xl font-extrabold tracking-tight tabular-nums">{formatKurus(p.amount)}</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-y border-line bg-paper/60 px-6 py-4 text-sm">
        <span className="text-ink-soft">Alıcı</span>
        <span className="flex items-center gap-1.5 text-right font-semibold">
          {p.payee.fullName}
          {p.payee.isVerified && <VerifiedIcon className="h-4 w-4 text-[#2f7de1]" aria-label="Onaylı danışman" />}
          {p.payee.officeName && <span className="font-normal text-ink-soft">· {p.payee.officeName}</span>}
        </span>
      </div>
      <div className="space-y-3 p-6">
        {p.status === "paid" ? (
          <Alert tone="ok" title="Ödeme alındı">
            Teşekkürler. Ödeme {p.paidAt ? formatDate(p.paidAt) : ""} tarihinde tamamlandı.
          </Alert>
        ) : p.status !== "open" ? (
          <Alert tone="warn" title="Bu bağlantı artık geçerli değil">
            {p.status === "expired" ? "Ödeme süresi doldu." : "Talep iptal edildi."} Danışmanınızdan yeni bağlantı isteyin.
          </Alert>
        ) : session && p.provider === "mock" ? (
          <>
            <Alert tone="warn" title="Test ödeme ekranı">
              Gerçek ödeme sağlayıcısı bağlanana kadar ödeme burada denenir; karttan çekim yapılmaz.
            </Alert>
            <div className="space-y-2 rounded-2xl border border-line p-4 font-mono text-sm text-ink-soft">
              <p>4111 1111 1111 1111</p>
              <p>12/30 · 123</p>
            </div>
            <Button className="w-full" loading={busy} onClick={() => mock("success")}>
              {formatKurus(p.amount)} öde
            </Button>
            <Button className="w-full" variant="ghost" disabled={busy} onClick={() => mock("fail")}>
              Reddedilen kartı dene
            </Button>
          </>
        ) : (
          <>
            <Button className="w-full !h-12 text-base" loading={busy} onClick={start}>
              Kartla öde
            </Button>
            <p className="text-center text-xs text-ink-soft">Son geçerlilik: {formatDate(p.expiresAt)}</p>
          </>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </div>
  );
}
