"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Check, CircleAlert, FileUp, Hourglass, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { AVATAR_PRESET_IDS, Avatar } from "@/components/data-ui";
import { LegalLink } from "@/components/legal-dialog";
import { PasswordInput, PasswordRules, passwordChecks } from "@/components/password-input";
import { Alert, Button, Field, Input, Logo, Spinner, Textarea } from "@/components/ui";
import { api, ApiError, fileUrl, type DocumentTypeDef, type Me, type Verification } from "@/lib/api";
import { formatBytes, MISSING_LABEL, docLabel } from "@/lib/format";
import { sortTr } from "@/lib/listing";

const STEPS = ["Telefon", "Hesap", "Mesleki bilgiler", "Profil resmi", "Belgeler", "Gönder"] as const;
type Step = 0 | 1 | 2 | 3 | 4 | 5;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.bmp,.webp,application/pdf,image/jpeg,image/png,image/bmp,image/webp";

/** Oturum varsa kullanıcı, yoksa null (401'de giriş sayfasına yönlendirmeden) */
async function tryMe(): Promise<Me | null> {
  const res = await fetch("/api/backend/me", { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Me;
}

export function ApplyWizard() {
  const qc = useQueryClient();
  // Kullanıcı ileri/geri gittiyse onun seçtiği adım; yoksa oturum ve başvuru durumundan çıkarılan adım
  const [manual, setStep] = useState<Step | null>(null);
  const me = useQuery({ queryKey: ["apply-me"], queryFn: tryMe, staleTime: 0 });
  const verification = useQuery({
    queryKey: ["apply-verification"],
    queryFn: () => api<Verification>("/agents/me/verification"),
    enabled: me.data?.role === "agent",
  });
  const docTypes = useQuery({ queryKey: ["doc-types"], queryFn: () => api<DocumentTypeDef[]>("/agents/document-types") });

  let derived: Step | null = null;
  let blocked: ReactNode = null;
  const m = me.data;
  if (!me.isPending) {
    if (!m) derived = 0;
    else if (m.onboardingRequired) derived = 1;
    else if (m.role !== "agent") {
      blocked = (
        <>
          Bu numara <strong>{m.role === "admin" ? "yönetici" : "mülk sahibi / alıcı"}</strong> hesabına bağlı. Danışman başvurusu için farklı bir cep telefonu
          numarasıyla başvurabilirsin.
        </>
      );
    } else if (verification.data) {
      const v = verification.data;
      const p = v.profile;
      if (v.status === "pending" || v.status === "approved") derived = 5;
      else if (!p.licenseNumber || !p.businessName || !p.city || !p.district) derived = 2;
      else if (!m.avatar) derived = 3;
      else derived = 4;
    }
  }
  // Başvuru gönderildiyse her zaman sonuç ekranı
  const step: Step | null = derived === 5 ? 5 : (manual ?? derived);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["apply-me"] });
    await qc.invalidateQueries({ queryKey: ["apply-verification"] });
  };
  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/" aria-label="Emlook">
            <Logo />
          </Link>
          <Link href="/giris" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Girişe dön
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8 sm:py-12">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Danışman başvurusu</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Onaylı danışman ol</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Yetki belgen ve evrakların incelendikten sonra profilinde onay rozeti görünür; portföy paylaşabilir, eşleşebilir ve komisyonunu online tahsil edebilirsin.
        </p>

        {step !== null && step < 5 && (
          <ol className="mt-8 grid grid-cols-5 gap-2" aria-label="Başvuru adımları">
            {STEPS.slice(0, 5).map((label, i) => (
              <li key={label} className="grid gap-1.5">
                <span className={`h-1.5 rounded-full ${i < step ? "bg-ok" : i === step ? "bg-brand" : "bg-line"}`} />
                <span className={`hidden text-xs font-semibold sm:block ${i === step ? "text-ink" : "text-ink-soft"}`}>
                  {i + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
        )}

        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(22,23,28,.05)] sm:p-8">
          {blocked ? (
            <Alert tone="warn" title="Bu hesapla başvuru yapılamaz">
              {blocked}
            </Alert>
          ) : step === null ? (
            <Spinner />
          ) : step === 0 ? (
            <PhoneStep docTypes={docTypes.data} onDone={async () => { await refresh(); setStep(null); }} />
          ) : step === 1 ? (
            <AccountStep me={me.data!} onDone={async () => { await refresh(); go(2); }} />
          ) : step === 2 ? (
            <ProfessionStep v={verification.data} onBack={() => go(1)} onDone={async () => { await refresh(); go(3); }} />
          ) : step === 3 ? (
            <AvatarStep me={me.data} onBack={() => go(2)} onDone={async () => { await refresh(); go(4); }} />
          ) : step === 4 ? (
            <DocumentsStep v={verification.data} onChange={refresh} onBack={() => go(3)} onNext={() => go(5)} />
          ) : (
            <SubmitStep v={verification.data} onBack={() => go(4)} onChange={refresh} />
          )}
        </section>
      </main>
    </div>
  );
}

function StepTitle({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Adım {n} / 5</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{text}</p>
    </div>
  );
}

function Nav({ onBack, next, busy, disabled }: { onBack?: () => void; next: string; busy?: boolean; disabled?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Geri
        </button>
      ) : (
        <span />
      )}
      <Button type="submit" loading={busy} disabled={disabled}>
        {next} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---- 1. Telefon ----
function PhoneStep({ docTypes, onDone }: { docTypes?: DocumentTypeDef[]; onDone: () => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!sent) {
        await api("/api/auth/otp/request", { json: { phone } });
        setSent(true);
      } else {
        await api("/api/auth/otp/verify", { json: { phone, code } });
        await onDone();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <form onSubmit={submit}>
        <StepTitle n={1} title="Cep telefonunu doğrula" text="Hesabın telefon numaranla açılır; giriş için de bu numarayı kullanırsın." />
        <div className="grid gap-4">
          <Field label="Cep telefonu">
            <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="05XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={sent} autoFocus />
          </Field>
          {sent && (
            <Field label="Doğrulama kodu" hint={`${phone} numarasına gönderilen 6 haneli kod`}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                className="text-center text-2xl tracking-[0.5em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
                required
              />
            </Field>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
        <Nav next={sent ? "Doğrula ve devam et" : "Kod gönder"} busy={busy} disabled={sent && code.length !== 6} />
        <p className="mt-3 text-sm text-ink-soft">
          Zaten hesabın var mı?{" "}
          <Link href="/giris?donus=/basvuru" className="font-semibold text-ink hover:text-brand">
            Giriş yap
          </Link>{" "}
          — başvuruna kaldığın yerden devam edersin.
        </p>
      </form>
      <aside className="rounded-xl border border-line bg-paper p-5 text-sm">
        <p className="font-bold text-ink">Hazırlaman gerekenler</p>
        <ul className="mt-3 grid gap-2 text-ink-soft">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> Taşınmaz ticareti yetki belgesi numaran</li>
          {docTypes?.map((d) => (
            <li key={d.key} className="flex gap-2">
              <FileUp className={`mt-0.5 h-4 w-4 shrink-0 ${d.required ? "text-brand" : "text-ink-soft"}`} />
              <span>
                {d.label} {d.required ? <span className="text-xs font-bold text-brand">zorunlu</span> : <span className="text-xs">(isteğe bağlı)</span>}
              </span>
            </li>
          ))}
          <li className="flex gap-2"><Camera className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" /> Profil fotoğrafı (veya hazır avatar)</li>
        </ul>
        <p className="mt-4 text-xs text-ink-soft">Belgeler PDF veya resim (JPG, PNG, BMP, WEBP) olabilir; en fazla 10 MB.</p>
      </aside>
    </div>
  );
}

// ---- 2. Hesap ----
function AccountStep({ me, onDone }: { me: Me; onDone: () => Promise<void> }) {
  const [fullName, setFullName] = useState(me.fullName ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [password, setPassword] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwOk = !password || passwordChecks(password).every((c) => c.ok);
  const link = "font-semibold text-ink underline underline-offset-2";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/me/onboarding", {
        json: { fullName: fullName.trim(), accountType: "agent", email: email.trim() || undefined, kvkkClarification: kvkk, termsOfUse: terms, marketing },
      });
      if (password) await api("/auth/password", { method: "PUT", json: { newPassword: password } });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepTitle n={2} title="Hesap bilgileri" text="Adın profilinde ve ilanlarında görünür. E-posta ve parola belirlersen e-postanla da giriş yapabilirsin." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Ad soyad">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required minLength={3} autoFocus />
          </Field>
        </div>
        <Field label="E-posta (önerilir)">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@ofisiniz.com" />
        </Field>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="apply-pw">
            Parola (isteğe bağlı)
          </label>
          <PasswordInput id="apply-pw" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!email} placeholder={email ? "" : "Önce e-posta girin"} />
          {password && <PasswordRules value={password} />}
        </div>
      </div>
      <div className="mt-6 grid gap-3 rounded-xl border border-line bg-paper/60 p-4 text-sm">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--brand)]" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} required />
          <span><LegalLink slug="kvkk" className={link}>KVKK Aydınlatma Metni</LegalLink>&apos;ni okudum ve anladım.</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--brand)]" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span><LegalLink slug="kosullar" className={link}>Kullanım Koşulları</LegalLink>&apos;nı kabul ediyorum.</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--brand)]" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>
            <LegalLink slug="ticari-ileti" className={link}>Ticari elektronik ileti</LegalLink> metni kapsamında kampanya ve duyuru almak istiyorum (isteğe bağlı).
          </span>
        </label>
      </div>
      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
      <Nav next="Devam et" busy={busy} disabled={!kvkk || !terms || fullName.trim().length < 3 || !pwOk} />
    </form>
  );
}

// ---- 3. Mesleki bilgiler ----
interface City { code: string; name: string }
interface NamedId { id: number; name: string }

function ProfessionStep({ v, onBack, onDone }: { v?: Verification; onBack: () => void; onDone: () => Promise<void> }) {
  const p = v?.profile;
  const [licenseNumber, setLicense] = useState(p?.licenseNumber ?? "");
  const [businessName, setBusiness] = useState(p?.businessName ?? "");
  const [city, setCity] = useState(p?.city ?? "");
  const [district, setDistrict] = useState(p?.district ?? "");
  const [bio, setBio] = useState(p?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<City[]>("/locations/cities") });
  const cityCode = cities.data?.find((c) => c.name === city)?.code;
  const districts = useQuery({
    queryKey: ["districts", cityCode],
    queryFn: async () => sortTr(await api<NamedId[]>(`/locations/cities/${cityCode}/districts`)),
    enabled: !!cityCode,
  });
  const select = "h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] focus:border-ink focus:outline-none";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/agents/me/profile", { method: "PATCH", json: { licenseNumber, businessName, city, district, bio: bio || undefined } });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepTitle n={3} title="Mesleki bilgiler" text="Yetki belgesindeki bilgilerle aynı olmalı; yönetici başvurunu bu bilgilerle karşılaştırır." />
      {v?.status === "rejected" && v.rejectionReason && (
        <div className="mb-5">
          <Alert tone="error" title="Başvurun düzeltme bekliyor">
            {v.rejectionReason}
          </Alert>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Yetki belgesi numarası">
          <Input value={licenseNumber} onChange={(e) => setLicense(e.target.value)} required minLength={3} placeholder="3400123" />
        </Field>
        <Field label="İşletme unvanı">
          <Input value={businessName} onChange={(e) => setBusiness(e.target.value)} required minLength={2} placeholder="Yılmaz Gayrimenkul Ltd. Şti." />
        </Field>
        <Field label="Çalıştığın il">
          <select className={select} value={city} onChange={(e) => { setCity(e.target.value); setDistrict(""); }} required>
            <option value="">Seçin</option>
            {sortTr(cities.data ?? []).map((c) => (
              <option key={c.code} value={c.name}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="İlçe">
          <select className={select} value={district} onChange={(e) => setDistrict(e.target.value)} required disabled={!cityCode}>
            <option value="">Seçin</option>
            {districts.data?.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Kısa tanıtım (isteğe bağlı)" hint={`${bio.length} / 600 · Uzmanlık bölgelerin, deneyimin. Profilinde görünür ve rozet puanına katkı sağlar.`}>
            <Textarea value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} placeholder="15 yıldır Kadıköy ve Moda'da konut danışmanlığı yapıyorum…" />
          </Field>
        </div>
      </div>
      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
      <Nav onBack={onBack} next="Devam et" busy={busy} disabled={!licenseNumber || !businessName || !city || !district} />
    </form>
  );
}

// ---- 4. Profil resmi ----
function AvatarStep({ me, onBack, onDone }: { me?: Me | null; onBack: () => void; onDone: () => Promise<void> }) {
  const [avatar, setAvatar] = useState(me?.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<{ avatar: Me["avatar"] }>("/me/avatar", { form });
      setAvatar(res.avatar);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function pick(preset: string) {
    setError(null);
    const res = await api<{ avatar: Me["avatar"] }>("/me/avatar", { method: "PUT", json: { preset } });
    setAvatar(res.avatar);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void onDone(); }}>
      <StepTitle n={4} title="Profil resmi" text="Kendi fotoğrafını yükleyebilir ya da hazır bir avatar seçebilirsin. Fotoğraflı profiller daha çok güven verir." />
      <div className="grid gap-8 sm:grid-cols-[180px_1fr]">
        <div className="grid justify-items-center gap-3">
          <Avatar avatar={avatar} name={me?.fullName} size={140} className="ring-4 ring-paper" />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/bmp,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
          <Button type="button" variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Fotoğraf yükle
          </Button>
          <p className="text-center text-xs text-ink-soft">JPG, PNG, BMP veya WEBP · en fazla 5 MB</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">veya hazır avatar seç</p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {AVATAR_PRESET_IDS.map((id) => {
              const on = avatar?.kind === "preset" && avatar.preset === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void pick(id)}
                  aria-label={`Avatar ${id}`}
                  aria-pressed={on}
                  className={`grid place-items-center rounded-full p-1 transition ${on ? "ring-2 ring-brand ring-offset-2" : "hover:ring-2 hover:ring-line"}`}
                >
                  <Avatar avatar={{ kind: "preset", preset: id }} size={56} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
      <Nav onBack={onBack} next={avatar ? "Devam et" : "Şimdilik geç"} />
    </form>
  );
}

// ---- 5. Belgeler ----
function DocumentsStep({ v, onChange, onBack, onNext }: { v?: Verification; onChange: () => Promise<void>; onBack: () => void; onNext: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!v) return <Spinner />;
  const missingDocs = v.documentTypes.filter((t) => t.required && !v.documents.some((d) => d.type === t.key));

  async function upload(type: string, file: File) {
    setBusy(type);
    setError(null);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      await api("/agents/me/documents", { form });
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }
  async function remove(id: string) {
    setBusy(id);
    try {
      await api(`/agents/me/documents/${id}`, { method: "DELETE" });
      await onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }}>
      <StepTitle n={5} title="Belgeler" text="Yöneticinin istediği belgeleri yükle. PDF veya resim (JPG, PNG, BMP, WEBP), en fazla 10 MB." />
      <ul className="grid gap-3">
        {v.documentTypes.map((t) => {
          const files = v.documents.filter((d) => d.type === t.key);
          return (
            <li key={t.key} className={`rounded-xl border p-4 ${files.length ? "border-ok/30 bg-ok-tint/40" : t.required ? "border-brand/25" : "border-line"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {files.length ? <Check className="h-4 w-4 text-ok" /> : <FileUp className="h-4 w-4 text-ink-soft" />}
                    {t.label}
                    {t.required ? (
                      <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10.5px] font-bold text-brand">Zorunlu</span>
                    ) : (
                      <span className="rounded-full bg-paper px-2 py-0.5 text-[10.5px] font-bold text-ink-soft">İsteğe bağlı</span>
                    )}
                  </p>
                  {t.description && <p className="mt-1 text-xs text-ink-soft">{t.description}</p>}
                </div>
                <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:border-ink-soft ${busy === t.key ? "opacity-60" : ""}`}>
                  <Upload className="h-4 w-4" /> {busy === t.key ? "Yükleniyor…" : files.length ? "Bir dosya daha" : "Dosya seç"}
                  <input type="file" accept={ACCEPT} className="hidden" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(t.key, f); e.target.value = ""; }} />
                </label>
              </div>
              {files.length > 0 && (
                <ul className="mt-3 grid gap-2">
                  {files.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                      <a href={fileUrl(`/agents/me/documents/${d.id}/file`)} target="_blank" rel="noreferrer" className="min-w-0 truncate font-medium hover:text-brand">
                        {d.originalName}
                      </a>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-ink-soft">
                        {formatBytes(d.sizeBytes)}
                        <button type="button" onClick={() => void remove(d.id)} disabled={busy === d.id} className="text-ink-soft hover:text-brand" aria-label="Sil">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
      {missingDocs.length > 0 && <p className="mt-4 text-sm text-ink-soft">Devam etmek için zorunlu belgeleri yükle: {missingDocs.map((d) => d.label).join(", ")}</p>}
      <Nav onBack={onBack} next="Özet ve gönder" disabled={missingDocs.length > 0} />
    </form>
  );
}

// ---- 6. Gönder ----
function SubmitStep({ v, onBack, onChange }: { v?: Verification; onBack: () => void; onChange: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!v) return <Spinner />;

  if (v.status === "pending" || v.status === "approved") {
    const ok = v.status === "approved";
    return (
      <div className="grid justify-items-start gap-4">
        <span className={`grid h-14 w-14 place-items-center rounded-2xl ${ok ? "bg-ok-tint text-ok" : "bg-warn-tint text-warn"}`}>
          {ok ? <BadgeCheck className="h-7 w-7" /> : <Hourglass className="h-7 w-7" />}
        </span>
        <h2 className="text-2xl font-extrabold tracking-tight">{ok ? "Onaylı danışmansın" : "Başvurun incelemede"}</h2>
        <p className="max-w-xl text-ink-soft">
          {ok
            ? "Profilinde onay rozeti görünüyor. Portföyünü ekleyip EİDS doğrulamasıyla yayına alabilirsin."
            : "Ekibimiz yetki belgeni ve evraklarını kontrol ediyor. Sonuçlandığında uygulama içi bildirimle haber vereceğiz. Bu sırada akışı inceleyebilirsin."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.push(ok ? "/panel/portfoy/yeni" : "/akis")}>{ok ? "İlk ilanını ekle" : "Akışa git"}</Button>
          <Link href="/panel" className="inline-flex h-12 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-ink-soft">
            Panele git
          </Link>
        </div>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/agents/me/submit", { method: "POST" });
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError && Array.isArray(err.details?.missing) ? `Eksik: ${(err.details.missing as string[]).map((m) => MISSING_LABEL[m] ?? docLabel(m.replace("document:", ""), v!.documentTypes)).join(", ")}` : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const p = v.profile;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <StepTitle n={5} title="Özet ve gönder" text="Bilgilerini kontrol et. Gönderdikten sonra inceleme bitene kadar düzenleyemezsin." />
      <dl className="grid gap-x-8 gap-y-3 rounded-xl border border-line p-5 text-sm sm:grid-cols-2">
        {(
          [
            ["Yetki belgesi no", p.licenseNumber],
            ["İşletme unvanı", p.businessName],
            ["Bölge", [p.district, p.city].filter(Boolean).join(", ")],
            ["Belgeler", `${v.documents.length} dosya · ${[...new Set(v.documents.map((d) => docLabel(d.type, v.documentTypes)))].join(", ")}`],
          ] as const
        ).map(([k, val]) => (
          <div key={k}>
            <dt className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">{k}</dt>
            <dd className="mt-0.5 font-semibold text-ink">{val || "—"}</dd>
          </div>
        ))}
        {p.bio && (
          <div className="sm:col-span-2">
            <dt className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">Tanıtım</dt>
            <dd className="mt-0.5 text-ink-soft">{p.bio}</dd>
          </div>
        )}
      </dl>
      {v.missing.length > 0 && (
        <div className="mt-4">
          <Alert tone="warn" title="Eksik bilgiler">
            <span className="inline-flex items-center gap-1"><CircleAlert className="h-4 w-4" /> {v.missing.map((m) => MISSING_LABEL[m] ?? docLabel(m.replace("document:", ""), v.documentTypes)).join(", ")}</span>
          </Alert>
        </div>
      )}
      {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
      <Nav onBack={onBack} next="Başvuruyu gönder" busy={busy} disabled={v.missing.length > 0} />
    </form>
  );
}
