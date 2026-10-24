"use client";

import { Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LegalLink } from "@/components/legal-dialog";
import { PasswordInput } from "@/components/password-input";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api, ApiError, type Me } from "@/lib/api";

type Method = "phone" | "email";
type Step = "phone" | "code";

/** Yalnızca site içi göreli adreslere dönülür (açık yönlendirmeyi önler). */
function safeReturn(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // ?yontem=eposta ile (ör. parola yenilendikten sonra) e-posta sekmesi açılır
  const [method, setMethod] = useState<Method>(params.get("yontem") === "eposta" ? "email" : "phone");
  const notice = params.get("yenilendi") ? "Parolan yenilendi. Yeni parolanla giriş yapabilirsin." : null;

  async function finish(onboardingRequired: boolean) {
    if (onboardingRequired) {
      router.replace("/kayit");
      return;
    }
    const me = await api<Me>("/me");
    router.replace(safeReturn(params.get("donus")) ?? (me.role === "admin" ? "/admin" : "/panel"));
  }

  return (
    <div>
      <h2 className="text-3xl font-extrabold tracking-tight">Giriş yap</h2>
      <p className="mt-2 text-ink-soft">Emlook hesabına telefonun veya e-postanla gir.</p>

      <div role="tablist" aria-label="Giriş yöntemi" className="mt-7 grid grid-cols-2 rounded-xl border border-line bg-paper p-1">
        {(
          [
            ["phone", "Telefon ile", Smartphone],
            ["email", "E-posta ile", Mail],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`tab-${m}`}
            aria-selected={method === m}
            aria-controls={`panel-${m}`}
            onClick={() => setMethod(m)}
            className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${
              method === m ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="mt-5">
          <Alert tone="ok">{notice}</Alert>
        </div>
      )}

      <div className="mt-6" role="tabpanel" id={`panel-${method}`} aria-labelledby={`tab-${method}`}>
        {method === "phone" ? <PhoneLogin onDone={finish} /> : <EmailLogin onDone={finish} onUsePhone={() => setMethod("phone")} />}
      </div>

      <LegalNotice />
    </div>
  );
}

function PhoneLogin({ onDone }: { onDone: (onboardingRequired: boolean) => Promise<void> }) {
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
      const res = await api<{ resendInSeconds: number }>("/api/auth/otp/request", { json: { phone } });
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
      const res = await api<{ onboardingRequired: boolean }>("/api/auth/otp/verify", { json: { phone, code } });
      await onDone(res.onboardingRequired);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCode("");
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} className="space-y-5">
        <Field label="Cep telefonu" hint="Tek kullanımlık bir kod göndereceğiz. Hesabın yoksa aynı adımla oluşturulur.">
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
    <form onSubmit={verify} className="space-y-5">
      <p className="text-sm text-ink-soft">
        <span className="font-semibold text-ink">{phone}</span> numarasına gelen 6 haneli kodu yaz.{" "}
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
          <button type="button" className="font-semibold text-ink hover:text-brand" onClick={() => sendCode()}>
            Kodu tekrar gönder
          </button>
        )}
      </p>
    </form>
  );
}

function EmailLogin({ onDone, onUsePhone }: { onDone: (onboardingRequired: boolean) => Promise<void>; onUsePhone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ onboardingRequired: boolean }>("/api/auth/password/login", { json: { email, password } });
      await onDone(res.onboardingRequired);
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, code: err.code } : { message: String(err) });
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="E-posta">
        <Input
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="ornek@ofisiniz.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </Field>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="login-password" className="text-sm font-semibold text-ink">
            Parola
          </label>
          <Link href={`/parola-sifirla${email ? `?eposta=${encodeURIComponent(email)}` : ""}`} className="text-sm font-semibold text-brand hover:underline">
            Parolamı unuttum
          </Link>
        </div>
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          placeholder="Parolan"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && (
        <Alert tone="error">
          {error.message}
          {error.code === "INVALID_CREDENTIALS" && (
            <span className="mt-1 block text-ink-soft">
              Henüz parola belirlemediysen telefonla giriş yapıp <strong>Panel › Giriş ve güvenlik</strong> bölümünden
              belirleyebilir ya da &quot;Parolamı unuttum&quot; ile oluşturabilirsin.
            </span>
          )}
        </Alert>
      )}
      <Button type="submit" loading={busy} className="w-full">
        Giriş yap
      </Button>
      <p className="text-center text-sm text-ink-soft">
        Hesabın yok mu?{" "}
        <button type="button" onClick={onUsePhone} className="font-semibold text-ink hover:text-brand">
          Telefonla kayıt ol
        </button>
      </p>
    </form>
  );
}

/** Giriş ekranındaki hukuki bilgilendirme: metinler pencere içinde okunabilir */
function LegalNotice() {
  const link = "font-semibold text-ink underline decoration-line underline-offset-2 hover:decoration-ink";
  return (
    <div className="mt-8 rounded-xl border border-line bg-paper/70 p-4 text-xs leading-relaxed text-ink-soft">
      <p>
        Devam ederek <LegalLink slug="kosullar" className={link}>Kullanım Koşulları</LegalLink>&apos;nı kabul etmiş olursun.
        Kişisel verilerinin hangi amaçla ve hukuki sebeple işlendiğini{" "}
        <LegalLink slug="kvkk" className={link}>KVKK Aydınlatma Metni</LegalLink>&apos;nde bulabilirsin.
      </p>
      <p className="mt-2">
        Kampanya ve duyuru iletileri yalnızca izin verirsen gönderilir; izni dilediğin zaman geri alabilirsin (
        <LegalLink slug="ticari-ileti" className={link}>Ticari Elektronik İleti</LegalLink>).
      </p>
      <p className="mt-2">Oturumun şifreli bağlantıyla korunur; parolan yalnızca tek yönlü özet olarak saklanır.</p>
    </div>
  );
}
