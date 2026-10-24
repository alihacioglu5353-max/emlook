"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  ExternalLink,
  Flag,
  House,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, type AdminDashboard, type Me } from "@/lib/api";
import { NotificationBell } from "./notification-bell";
import { Logo } from "./ui";

type CountKey = keyof AdminDashboard;
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: CountKey;
}
const NAV: ({ section: string } | NavItem)[] = [
  { href: "/admin", label: "Özet", icon: LayoutDashboard },
  { section: "Onay" },
  { href: "/admin/basvurular", label: "Danışman başvuruları", icon: BadgeCheck, count: "pendingVerifications" },
  { href: "/admin/ofisler", label: "Ofisler", icon: Building2, count: "pendingOffices" },
  { section: "Yönetim" },
  { href: "/admin/kullanicilar", label: "Kullanıcılar", icon: Users },
  { href: "/admin/ilanlar", label: "İlanlar", icon: House, count: "pendingEids" },
  { href: "/admin/sikayetler", label: "Şikâyetler", icon: Flag, count: "openReports" },
  { section: "Finans" },
  { href: "/admin/odemeler", label: "Ödemeler", icon: Wallet, count: "pendingInvoices" },
];
const items = NAV.filter((n): n is NavItem => "href" in n);

const initials = (name: string | null) =>
  (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase("tr-TR"))
    .join("");

function Avatar({ name, size = 32, dark }: { name: string | null; size?: number; dark?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`inline-grid shrink-0 place-items-center rounded-full text-[11px] font-bold ${
        dark ? "bg-white/15 text-white" : "bg-brand-tint text-brand-ink"
      }`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Yönetim paneli çerçevesi (Elasoft yönetim paneli düzeni, Emlook renkleri):
 * koyu yan menü + kırmızı logo şeridi, beyaz üst bar, sıcak kırık beyaz içerik alanı.
 */
export function AdminFrame({ me, onLogout, children }: { me: Me; onLogout: () => void; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Çerçeve yalnızca istemcide (oturum yüklendikten sonra) çizilir; depolamayı doğrudan okumak güvenli
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("emlook.admin.collapsed") === "1";
    } catch {
      return false;
    }
  });
  // Mobil menü açıldığı sayfada açık kalır; sayfa değişince kendiliğinden kapanır
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const mobileOpen = openedAt === pathname;
  const setMobileOpen = (open: boolean) => setOpenedAt(open ? pathname : null);
  const counts = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api<AdminDashboard>("/admin/dashboard"),
    refetchInterval: 60_000,
  }).data;

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("emlook.admin.collapsed", c ? "0" : "1");
      } catch {
        /* yok say */
      }
      return !c;
    });

  const active = items
    .filter((x) => pathname === x.href || pathname.startsWith(x.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const title = pathname === "/admin" ? "Yönetim Özeti" : (active?.label ?? "Yönetim");
  const sub = pathname.split("/").length > 3;

  const sidebar = (mini: boolean) => (
    <nav className="grid h-full grid-rows-[auto_1fr_auto] bg-ink text-white" aria-label="Yönetim menüsü">
      <div className="flex h-16 items-center gap-3 bg-brand px-5">
        <Link href="/admin" aria-label="Yönetim özeti" className="flex min-w-0 items-center">
          {mini ? <Logo light mono markOnly /> : <Logo light mono />}
        </Link>
        {!mini && (
          <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Yönetim
          </span>
        )}
      </div>
      <ul className="grid content-start gap-0.5 overflow-y-auto px-3 py-4">
        {NAV.map((n) => {
          if ("section" in n) {
            return (
              <li
                key={n.section}
                className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40"
              >
                {mini ? "·" : n.section}
              </li>
            );
          }
          const on = active?.href === n.href;
          const count = n.count && counts ? counts[n.count] : 0;
          const Icon = n.icon;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                title={n.label}
                aria-current={on ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition ${
                  on ? "bg-brand font-bold text-white" : "font-medium text-white/75 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} aria-hidden />
                {!mini && <span className="flex-1 truncate">{n.label}</span>}
                {!mini && count > 0 && (
                  <span
                    className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[10px] font-bold ${
                      on ? "bg-white/25" : "bg-white/10"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <Avatar name={me.fullName} size={28} dark />
        {!mini && (
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-xs font-bold">{me.fullName}</span>
            <span className="text-[11px] text-white/55">Platform yöneticisi</span>
          </span>
        )}
        {!mini && (
          <button
            onClick={onLogout}
            aria-label="Çıkış"
            title="Çıkış"
            className="grid h-8 w-8 place-items-center rounded-md border border-white/25 text-white/85 transition hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <aside
        className={`hidden shrink-0 transition-[width] duration-300 lg:block ${collapsed ? "w-[72px]" : "w-[252px]"}`}
      >
        {sidebar(collapsed)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Menüyü kapat" className="absolute inset-0 bg-ink/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] shadow-2xl">{sidebar(false)}</div>
        </div>
      )}

      <div className="grid min-w-0 flex-1 grid-rows-[auto_1fr]">
        <header className="flex h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:gap-4 sm:px-6">
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-paper lg:hidden"
            aria-label="Menüyü aç"
            onClick={() => setMobileOpen(true)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="grid min-w-0 gap-px">
            <nav aria-label="Konum" className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
              <Link href="/admin" className="hover:text-ink">
                Yönetim
              </Link>
              {pathname !== "/admin" && (
                <>
                  <span aria-hidden>/</span>
                  {sub && active ? (
                    <Link href={active.href} className="hover:text-ink">
                      {active.label}
                    </Link>
                  ) : (
                    <span>{active?.label}</span>
                  )}
                  {sub && (
                    <>
                      <span aria-hidden>/</span>
                      <span>Detay</span>
                    </>
                  )}
                </>
              )}
            </nav>
            <h1 className="truncate text-lg font-bold tracking-tight text-ink">{title}</h1>
          </div>
          <div className="flex-1" />
          <form
            role="search"
            className="hidden md:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
              router.push(q ? `/admin/kullanicilar?q=${encodeURIComponent(q)}` : "/admin/kullanicilar");
            }}
          >
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
              <input
                name="q"
                type="search"
                aria-label="Kullanıcı ara"
                placeholder="Kullanıcı ara: ad veya telefon"
                className="h-9 w-64 rounded-lg border border-line bg-paper pl-9 pr-3 text-sm focus:border-ink focus:bg-surface focus:outline-none"
              />
            </label>
          </form>
          <button
            onClick={toggle}
            aria-label={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            title={collapsed ? "Menüyü genişlet" : "Menüyü daralt"}
            className="hidden h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink lg:grid"
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
          <NotificationBell role={me.role} />
          <Link
            href="/akis"
            className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-bold text-ink shadow-sm hover:border-ink-soft sm:inline-flex"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Siteyi gör
          </Link>
          <div className="hidden items-center gap-2.5 border-l border-line pl-4 xl:flex">
            <Avatar name={me.fullName} />
            <span className="grid">
              <span className="text-xs font-bold text-ink">{me.fullName}</span>
              <span className="text-[11px] text-ink-soft">Yönetici</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-soft" aria-hidden />
          </div>
        </header>
        <main className="overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
