import { BadgeCheck, Handshake, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ui";

/**
 * Giriş, parola sıfırlama ve yenileme sayfalarının ortak düzeni.
 * Sol: koyu mürekkep zemin üzerinde yavaşça dolaşan kırmızı ışık lekeleri ve
 * süzülen örnek bildirim kartları (hareket azaltma tercihinde durur).
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-surface lg:flex lg:flex-col lg:justify-between">
        {/* Hareketli arka plan */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="auth-blob absolute -bottom-40 -left-32 h-[34rem] w-[34rem] rounded-full bg-brand/45 blur-3xl" />
          <div className="auth-blob auth-blob-2 absolute -right-40 top-10 h-[26rem] w-[26rem] rounded-full bg-brand/25 blur-3xl" />
          <div
            className="auth-grid absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(70% 70% at 50% 40%, black, transparent)",
            }}
          />
        </div>

        <Link href="/" aria-label="Emlook ana sayfa" className="relative w-fit">
          <Logo light />
        </Link>

        {/* Süzülen kartlar: ürünün yaptığı işten kesitler */}
        <div aria-hidden className="auth-rise auth-rise-3 pointer-events-none absolute right-10 top-28 hidden w-72 xl:block">
          <FloatCard className="auth-float" icon={Handshake} tone="brand" title="Yeni eşleşme" text="Moda'da deniz manzaralı 3+1 · Selin A." />
          <FloatCard className="auth-float auth-float-2 ml-10 mt-4" icon={BadgeCheck} tone="ok" title="EİDS doğrulandı" text="Bebek'te Boğaz manzaralı 3+1" />
          <FloatCard className="auth-float auth-float-3 -ml-4 mt-4" icon={Wallet} tone="light" title="Ödeme alındı" text="562.500 ₺ · payın 267.187 ₺" />
        </div>

        <div className="relative max-w-md">
          <p className="auth-rise mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#f08a99]">
            Emlakçılar için profesyonel ağ
          </p>
          <h1 className="auth-rise auth-rise-2 text-5xl font-extrabold leading-[1.05] tracking-tight">
            Paylaş. Eşleş.
            <br />
            <span className="auth-shine">Tahsil et.</span>
          </h1>
          <p className="auth-rise auth-rise-3 mt-6 text-lg text-white/70">
            Portföy paylaşımı, akıllı eşleşme ve faturalı komisyon tahsilatı tek bir uygulamada.
          </p>
          <ul className="auth-rise auth-rise-3 mt-8 grid gap-3 text-sm text-white/75">
            <li className="flex items-center gap-2.5">
              <BadgeCheck className="h-4 w-4 text-[#f08a99]" /> Yetki belgesi onaylı danışmanlar
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-[#f08a99]" /> EİDS ile doğrulanmış ilanlar
            </li>
            <li className="flex items-center gap-2.5">
              <LockKeyhole className="h-4 w-4 text-[#f08a99]" /> KVKK uyumlu, şifreli oturum
            </li>
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-sm text-white/40">
          <span>© {new Date().getFullYear()} Emlook</span>
          <nav className="flex gap-4" aria-label="Hukuki metinler">
            <Link href="/kvkk" className="hover:text-white/80">KVKK</Link>
            <Link href="/kosullar" className="hover:text-white/80">Koşullar</Link>
            <Link href="/ticari-ileti" className="hover:text-white/80">Ticari ileti</Link>
          </nav>
        </div>
      </aside>

      <section className="flex items-center justify-center px-5 py-10 sm:py-12">
        <div className="w-full max-w-[400px]">
          <Link href="/" aria-label="Emlook ana sayfa" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}

function FloatCard({
  icon: Icon,
  title,
  text,
  tone,
  className = "",
}: {
  icon: typeof Handshake;
  title: string;
  text: string;
  tone: "brand" | "ok" | "light";
  className?: string;
}) {
  const iconCls = { brand: "bg-brand text-white", ok: "bg-ok text-white", light: "bg-white text-ink" }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 shadow-2xl backdrop-blur-md ${className}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconCls}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="grid min-w-0">
        <span className="text-sm font-bold text-white">{title}</span>
        <span className="truncate text-xs text-white/60">{text}</span>
      </span>
    </div>
  );
}
