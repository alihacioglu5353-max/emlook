"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordInput, PasswordRules, passwordChecks } from "@/components/password-input";
import { Alert, Button, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const check = useQuery({
    queryKey: ["reset-token", token],
    queryFn: () => api<{ valid: boolean; email: string | null }>(`/auth/password/reset?token=${encodeURIComponent(token)}`),
    enabled: token.length > 0,
    retry: false,
  });
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strong = passwordChecks(password).every((c) => c.ok);
  const mismatch = repeat.length > 0 && repeat !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/password/reset", { json: { token, password } });
      router.replace("/giris?yontem=eposta&yenilendi=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (token && check.isPending) return <Spinner />;
  if (!token || !check.data?.valid) {
    return (
      <div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-tint text-brand">
          <CircleAlert className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-3xl font-extrabold tracking-tight">Bağlantı geçersiz</h2>
        <p className="mt-3 text-ink-soft">
          Yenileme bağlantısının süresi dolmuş, daha önce kullanılmış ya da eksik kopyalanmış olabilir. Yeni bir bağlantı isteyebilirsin.
        </p>
        <Link href="/parola-sifirla" className="mt-8 inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-ink">
          Yeni bağlantı iste
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight">Yeni parola belirle</h2>
        <p className="mt-2 text-ink-soft">
          <span className="font-semibold text-ink">{check.data.email}</span> hesabı için yeni parolanı yaz. Kaydettiğinde tüm cihazlardaki
          oturumların kapanır.
        </p>
      </div>
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-ink">
          Yeni parola
        </label>
        <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        <PasswordRules value={password} />
      </div>
      <Field label="Yeni parola (tekrar)" error={mismatch ? "Parolalar aynı değil" : undefined}>
        <PasswordInput autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} disabled={!strong || repeat !== password} className="w-full">
        Parolayı kaydet
      </Button>
    </form>
  );
}
