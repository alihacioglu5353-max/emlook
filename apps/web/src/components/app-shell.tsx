"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { api, type Me, type Role } from "@/lib/api";
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

  const nav =
    me?.role === "admin"
      ? [{ href: "/admin", label: "Danışman başvuruları" }]
      : me?.role === "agent"
        ? [
            { href: "/panel", label: "Genel bakış" },
            { href: "/panel/basvuru", label: "Onay başvurusu" },
          ]
        : [{ href: "/panel", label: "Genel bakış" }];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link href={me?.role === "admin" ? "/admin" : "/panel"} aria-label="Ana sayfa">
            <Logo />
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {nav.map((n) => {
              const active =
                n.href === pathname || (n.href !== "/panel" && pathname.startsWith(n.href));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                    active ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            {me && (
              <span className="hidden items-center gap-1.5 text-sm font-semibold sm:inline-flex">
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
