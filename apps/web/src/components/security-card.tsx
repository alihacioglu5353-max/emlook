"use client";

import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMe } from "@/components/app-shell";
import { PasswordInput, PasswordRules, passwordChecks } from "@/components/password-input";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

/** E-posta adresi ve parola: e-posta ile giriş için ikisi de gerekir */
export function SecurityCard() {
  const { me, reload } = useMe();
  const [email, setEmail] = useState(me.email ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"email" | "password" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const strong = passwordChecks(next).every((c) => c.ok);

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    setBusy("email");
    setMsg(null);
    try {
      await api("/me", { method: "PATCH", json: { email } });
      await reload();
      setMsg({ tone: "ok", text: "E-posta adresin kaydedildi." });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setBusy("password");
    setMsg(null);
    try {
      await api("/auth/password", { method: "PUT", json: { newPassword: next, ...(me.hasPassword ? { currentPassword: current } : {}) } });
      await reload();
      setCurrent("");
      setNext("");
      setMsg({ tone: "ok", text: "Parolan kaydedildi. Diğer cihazlardaki oturumların kapatıldı." });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mt-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">Giriş ve güvenlik</h2>
          <p className="text-sm text-ink-soft">
            Telefonla girişin her zaman açık. E-posta ve parola belirlersen e-postanla da giriş yapabilirsin.
          </p>
        </div>
      </div>

      <form onSubmit={saveEmail} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <Field label="E-posta">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@ofisiniz.com" required />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={busy === "email"} disabled={email.trim().toLowerCase() === (me.email ?? "")}>
          Kaydet
        </Button>
      </form>

      <form onSubmit={savePassword} className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
        <p className="text-sm text-ink-soft sm:col-span-2">
          {me.hasPassword
            ? `Parola belirlendi${me.passwordUpdatedAt ? ` · son değişiklik ${formatDate(me.passwordUpdatedAt)}` : ""}.`
            : "Henüz parolan yok."}
        </p>
        {me.hasPassword && (
          <Field label="Mevcut parola">
            <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
        )}
        <div className={me.hasPassword ? "" : "sm:col-span-2"}>
          <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="security-new">
            {me.hasPassword ? "Yeni parola" : "Parola"}
          </label>
          <PasswordInput id="security-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          {next && <PasswordRules value={next} />}
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy === "password"} disabled={!strong || !me.email || (me.hasPassword && !current)}>
            {me.hasPassword ? "Parolayı değiştir" : "Parola belirle"}
          </Button>
          {!me.email && <span className="ml-3 text-sm text-ink-soft">Önce e-posta adresini kaydet.</span>}
        </div>
      </form>

      {msg && (
        <div className="mt-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
    </Card>
  );
}
