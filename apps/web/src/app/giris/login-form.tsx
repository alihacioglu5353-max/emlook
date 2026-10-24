"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, ApiError, type Me } from "@/lib/api";

type Step = "phone" | "code";

/** Yalnızca site içi göreli adreslere dönülür (açık yönlendirmeyi önler). */
function safeReturn(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ resendInSeconds: number }>("/api/auth/otp/request", {
        json: { phone },
      });
      setStep("code");
      setResendIn(res.resendInSeconds);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      if (err instanceof ApiError && err.code === "OTP_RATE_LIMITED") {
        setResendIn(Number(err.details?.retryAfterSeconds ?? 60));
        if (step === "phone") setStep("code");
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ onboardingRequired: boolean }>("/api/auth/otp/verify", {
        json: { phone, code },
      });
      if (res.onboardingRequired) {
        router.replace("/kayit");
        return;
      }
      const me = await api<Me>("/me");
      router.replace(safeReturn(params.get("donus")) ?? (me.role === "admin" ? "/admin" : "/panel"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCode("");
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} className="space-y-6">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">Giriş yap</h2>
          <p className="mt-2 text-ink-soft">
            Cep telefonuna tek kullanımlık bir kod göndereceğiz. Hesabın yoksa aynı adımla
            oluşturulur.
          </p>
        </div>
        <Field label="Cep telefonu">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="05XX XXX XX XX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoFocus
          />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} className="w-full">
          Kod gönder
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight">Kodu gir</h2>
        <p className="mt-2 text-ink-soft">
          <span className="font-semibold text-ink">{phone}</span> numarasına gelen 6 haneli kodu
          yaz.{" "}
          <button
            type="button"
            className="font-semibold text-brand underline-offset-2 hover:underline"
            onClick={() => {
              setStep("phone");
              setCode("");
              setError(null);
            }}
          >
            Numarayı değiştir
          </button>
        </p>
      </div>
      <Field label="Doğrulama kodu">
        <Input
          ref={codeRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="••••••"
          className="text-center text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} disabled={code.length !== 6} className="w-full">
        Doğrula ve devam et
      </Button>
      <p className="text-center text-sm text-ink-soft">
        {resendIn > 0 ? (
          <>Yeni kod için {resendIn} sn</>
        ) : (
          <button
            type="button"
            className="font-semibold text-ink hover:text-brand"
            onClick={() => sendCode()}
          >
            Kodu tekrar gönder
          </button>
        )}
      </p>
    </form>
  );
}
