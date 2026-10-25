import Link from "next/link";
import type { ReactNode } from "react";
import { AuthIllustration } from "./auth-illustration";
import { Logo } from "./ui";

/**
 * Giriş, parola sıfırlama ve yenileme sayfalarının ortak düzeni.
 * Sol: vektörel şehir silüeti (auth-illustration) üzerinde logo ve kısa tanım.
 * Sağ: yalnızca form. Dar ekranda fotoğraf gizlenir.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(480px,560px)] xl:grid-cols-[minmax(0,1fr)_600px]">
      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <AuthIllustration className="absolute inset-0 h-full w-full" />

        <div className="relative flex h-full flex-col p-12 text-surface">
          <Link href="/" aria-label="Emlook ana sayfa" className="w-fit">
            <Logo light />
          </Link>

          <div className="mt-[12vh] max-w-lg">
            <h1 className="text-[2.5rem] font-bold leading-[1.15] tracking-tight">Emlak profesyonelleri için portföy ağı</h1>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              Yetki belgesi onaylı danışmanlar, EİDS ile doğrulanmış ilanlar ve güvenli komisyon tahsilatı.
            </p>
          </div>

          <p className="mt-auto text-xs text-white/45">© {year} Emlook</p>
        </div>
      </aside>

      <section className="flex min-h-screen flex-col px-6 py-8 sm:px-12">
        <Link href="/" aria-label="Emlook ana sayfa" className="w-fit lg:hidden">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10 lg:py-16">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </section>
    </main>
  );
}
