"use client";

import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";

export function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("eposta") ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/password/forgot", { json: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ok-tint text-ok">
          <MailCheck className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-3xl font-extrabold tracking-tight">E-postanı kontrol et</h2>
        <p className="mt-3 text-ink-soft">
          <span className="font-semibold text-ink">{email}</span> adresi kayıtlıysa parola yenileme bağlantısı gönderdik.
          Bağlantı 30 dakika geçerli ve yalnızca bir kez kullanılabilir.
        </p>
        <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Birkaç dakika içinde gelmezse gereksiz (spam) klasörüne bak.</li>
          <li>E-posta adresini hesabına eklemediysen telefonla giriş yapabilirsin.</li>
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/giris?yontem=eposta" className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-black">
            Girişe dön
          </Link>
          <button type="button" onClick={() => setSent(false)} className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-ink-soft">
            Farklı adres dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Link href="/giris?yontem=eposta" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Girişe dön
      </Link>
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight">Parolamı unuttum</h2>
        <p className="mt-2 text-ink-soft">
          Hesabına kayıtlı e-posta adresini yaz; parolanı yenilemen için bir bağlantı gönderelim.
        </p>
      </div>
      <Field label="E-posta">
        <Input type="email" inputMode="email" autoComplete="email" placeholder="ornek@ofisiniz.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} className="w-full">
        Yenileme bağlantısı gönder
      </Button>
      <p className="text-center text-sm text-ink-soft">
        E-postan kayıtlı değil mi?{" "}
        <Link href="/giris" className="font-semibold text-ink hover:text-brand">
          Telefonla giriş yap
        </Link>
      </p>
    </form>
  );
}
