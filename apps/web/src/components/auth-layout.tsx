import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import building from "@/assets/auth-building.jpg";
import { Logo } from "./ui";

/**
 * Giriş, parola sıfırlama ve yenileme sayfalarının ortak düzeni.
 * Sol: konut fotoğrafı (Pexels, ücretsiz ticari kullanım) üzerinde logo ve kısa tanım.
 * Sağ: yalnızca form. Dar ekranda fotoğraf gizlenir.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <main className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(480px,560px)] xl:grid-cols-[minmax(0,1fr)_600px]">
      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <Image
          src={building}
          alt=""
          fill
          preload
          placeholder="blur"
          sizes="(min-width: 1280px) calc(100vw - 600px), calc(100vw - 480px)"
          className="object-cover object-[30%_center]"
        />
        {/* Logo ve metnin okunması için koyu geçiş */}
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-ink via-ink/35 to-ink/25" />

        <div className="relative flex h-full flex-col justify-between p-12 text-surface">
          <Link href="/" aria-label="Emlook ana sayfa" className="w-fit">
            <Logo light mono />
          </Link>

          <div className="max-w-lg">
            <h1 className="text-[2.5rem] font-bold leading-[1.15] tracking-tight">Emlak profesyonelleri için portföy ağı</h1>
            <p className="mt-4 text-base leading-relaxed text-white/75">
              Yetki belgesi onaylı danışmanlar, EİDS ile doğrulanmış ilanlar ve güvenli komisyon tahsilatı.
            </p>
            <p className="mt-12 text-xs text-white/50">© {year} Emlook</p>
          </div>
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
