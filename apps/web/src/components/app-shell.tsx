"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { api, type Me, type Role } from "@/lib/api";
import { useUnreadMessages } from "./chat";
import { NotificationBell } from "./notification-bell";
import { Alert, Logo, Spinner, VerifiedIcon } from "./ui";

export const ME_KEY = ["me"] as const;

interface MeState {
  me: Me;
  reload: () => Promise<void>;
}
const MeContext = createContext<MeState | null>(null);

export function useMe(): MeState {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe yalnızca AppShell içinde kullanılabilir");
  return ctx;
}

/**
 * Oturumdaki kullanıcıyı yükler, rolü uygun değilse doğru alana yönlendirir.
 * `allow` verilmezse giriş yapmış herkes görebilir.
 */
export function AppShell({ allow, children }: { allow?: Role[]; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const meQuery = useQuery({ queryKey: ME_KEY, queryFn: () => api<Me>("/me") });
  const me = meQuery.data;

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
  }, [qc]);

  useEffect(() => {
    if (!me) return;
    if (me.onboardingRequired) router.replace("/kayit");
    else if (allow && (!me.role || !allow.includes(me.role))) {
      router.replace(me.role === "admin" ? "/admin" : "/panel");
    }
  }, [me, allow, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    qc.clear();
    router.replace("/giris");
  }

  const ready = me && !me.onboardingRequired && (!allow || (me.role && allow.includes(me.role)));
  const unread = useUnreadMessages(!!ready && me?.role !== "admin");
  const unreadCount = unread.data?.conversations ?? 0;

  const nav =
    me?.role === "admin"
      ? [
          { href: "/admin", label: "Danışman başvuruları" },
          { href: "/admin/ofisler", label: "Ofis başvuruları" },
        ]
      : me?.role === "agent"
        ? [
            { href: "/akis", label: "Akış" },
            { href: "/kesfet", label: "Keşfet" },
            { href: "/talepler", label: "Talepler" },
            { href: "/mesajlar", label: "Mesajlar" },
            { href: "/panel/portfoy", label: "Portföyüm" },
            { href: "/panel/odemeler", label: "Ödemeler" },
            // Onaylandıktan sonra başvuru sayfasına panelden ulaşılır
            ...(me.agent?.isVerified ? [] : [{ href: "/panel/basvuru", label: "Onay başvurusu" }]),
            { href: "/panel", label: "Panel" },
          ]
        : [
            { href: "/akis", label: "Akış" },
            { href: "/kesfet", label: "Keşfet" },
            { href: "/talepler", label: "Taleplerim" },
            { href: "/mesajlar", label: "Mesajlar" },
            { href: "/kaydedilenler", label: "Kaydedilenler" },
            { href: "/panel", label: "Hesabım" },
          ];

  // En uzun eşleşen menü öğesi etkin sayılır (/admin ile /admin/ofisler)
  const activeHref = nav
    .filter((x) => pathname === x.href || pathname.startsWith(x.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const navLinks = nav.map((n) => (
    <Link
      key={n.href}
      href={n.href}
      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
        n.href === activeHref ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
      }`}
    >
      {n.label}
      {n.href === "/mesajlar" && unreadCount > 0 && (
        <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
          {unreadCount}
        </span>
      )}
    </Link>
  ));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link href={me?.role === "admin" ? "/admin" : "/panel"} aria-label="Ana sayfa">
            <Logo />
          </Link>
          <nav className="hidden gap-1 sm:flex">{navLinks}</nav>
          <div className="ml-auto flex items-center gap-3">
            {ready && me.role !== "admin" && <HeaderSearch />}
            {ready && <NotificationBell role={me.role} />}
            {me && (
              <span className="hidden items-center gap-1.5 whitespace-nowrap text-sm font-semibold sm:inline-flex">
                {me.fullName}
                {me.agent?.isVerified && (
                  <VerifiedIcon className="h-4 w-4 text-[#2f7de1]" aria-label="Onaylı danışman" />
                )}
                {me.role === "admin" && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-white">
                    Yönetici
                  </span>
                )}
              </span>
            )}
            <button
              onClick={logout}
              className="text-sm font-semibold text-ink-soft hover:text-brand"
            >
              Çıkış
            </button>
          </div>
        </div>
        {nav.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 sm:hidden">
            {navLinks}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-10">
        {ready ? (
          <MeContext value={{ me, reload }}>{children}</MeContext>
        ) : meQuery.isError ? (
          <Alert tone="error" title="Bilgiler yüklenemedi">
            {meQuery.error.message}
          </Alert>
        ) : (
          <Spinner />
        )}
      </main>
    </div>
  );
}

/** Üst çubuktaki hızlı arama: /ara sayfasına serbest metinle gider */
function HeaderSearch() {
  const router = useRouter();
  return (
    <>
      <form
        role="search"
        className="hidden 2xl:block"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
          router.push(q ? `/ara?q=${encodeURIComponent(q)}` : "/ara");
        }}
      >
        <input
          name="q"
          type="search"
          aria-label="Portföy ara"
          placeholder="Ara: kadıköy 3+1…"
          className="h-10 w-56 rounded-full border border-line bg-paper px-4 text-sm focus:border-ink focus:bg-surface focus:outline-none"
        />
      </form>
      <Link
        href="/ara"
        aria-label="Ara"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink 2xl:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </Link>
    </>
  );
}
