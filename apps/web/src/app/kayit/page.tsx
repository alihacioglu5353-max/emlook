"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Eyebrow, Field, Input, Logo } from "@/components/ui";
import { api, type Me } from "@/lib/api";

type AccountType = "agent" | "consumer";

const TYPES: { value: AccountType; title: string; text: string }[] = [
  {
    value: "agent",
    title: "Emlak danışmanıyım",
    text: "Portföy paylaşır, meslektaşlarımla eşleşir, komisyonumu online tahsil ederim. Yetki belgemle onay alırım.",
  },
  {
    value: "consumer",
    title: "Mülk sahibiyim",
    text: "İlanları görüntüler, mülküm için doğrulanmış danışmanlara ulaşırım.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [type, setType] = useState<AccountType | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/me/onboarding", {
        json: {
          fullName,
          accountType: type,
          email: email.trim() || undefined,
          kvkkClarification: kvkk,
          termsOfUse: terms,
          marketing,
        },
      });
      router.replace(me.role === "agent" ? "/panel/basvuru" : "/panel");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <Logo className="mb-10" />
      <Eyebrow>Hesap kurulumu</Eyebrow>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Seni tanıyalım</h1>
      <p className="mt-2 text-ink-soft">Hesap tipini bir kez seçersin; sonradan değiştirilemez.</p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Hesap tipi</legend>
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={`cursor-pointer rounded-2xl border bg-surface p-5 transition ${
                type === t.value
                  ? "border-brand ring-2 ring-brand/20"
                  : "border-line hover:border-ink-soft"
              }`}
            >
              <input
                type="radio"
                name="type"
                value={t.value}
                className="sr-only"
                checked={type === t.value}
                onChange={() => setType(t.value)}
              />
              <span className="block text-lg font-bold">{t.title}</span>
              <span className="mt-1.5 block text-sm text-ink-soft">{t.text}</span>
            </label>
          ))}
        </fieldset>

        <Card className="space-y-5 !p-6">
          <Field label="Ad soyad">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              minLength={3}
              maxLength={80}
              required
            />
          </Field>
          <Field label="E-posta" hint="İsteğe bağlı; fatura ve bildirimler için kullanılır.">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
        </Card>

        <div className="space-y-3 text-sm">
          <Check checked={kvkk} onChange={setKvkk} required>
            <Link href="/kvkk" target="_blank" className="font-semibold text-ink underline">
              KVKK Aydınlatma Metni
            </Link>
            &apos;ni okudum ve anladım.
          </Check>
          <Check checked={terms} onChange={setTerms} required>
            <Link href="/kosullar" target="_blank" className="font-semibold text-ink underline">
              Kullanım Koşulları
            </Link>
            &apos;nı kabul ediyorum.
          </Check>
          <Check checked={marketing} onChange={setMarketing}>
            <Link href="/ticari-ileti" target="_blank" className="font-semibold text-ink underline">
              Ticari elektronik ileti
            </Link>{" "}
            metni kapsamında kampanya ve duyuru almak istiyorum (isteğe bağlı).
          </Check>
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        <Button
          type="submit"
          loading={busy}
          disabled={!type || !kvkk || !terms || fullName.trim().length < 3}
          className="w-full sm:w-auto"
        >
          Hesabımı oluştur
        </Button>
      </form>
    </main>
  );
}

function Check({
  checked,
  onChange,
  required,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-ink-soft">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
      />
      <span>{children}</span>
    </label>
  );
}
