"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { ReactNode } from "react";
import { api, fileUrl } from "@/lib/api";

/** Tablolarda sayfa başına kayıt */
export const PAGE_SIZE = 100;

/** Numaralı sayfalama: "1–100 / 245" + önceki/sonraki + sayfa numaraları */
export function Pagination({
  total,
  offset,
  pageSize = PAGE_SIZE,
  onChange,
}: {
  total: number;
  offset: number;
  pageSize?: number;
  onChange: (offset: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.floor(offset / pageSize) + 1;
  const go = (p: number) => onChange(Math.min(pages - 1, Math.max(0, p - 1)) * pageSize);
  // 1 … 4 5 [6] 7 8 … 20
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) nums.push(p);
    else if (nums.at(-1) !== "…") nums.push("…");
  }
  const btn = "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-bold transition";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-ink-soft tabular-nums">
        {total === 0 ? "Kayıt yok" : `${offset + 1}–${Math.min(offset + pageSize, total)} / ${total.toLocaleString("tr-TR")} kayıt`}
      </span>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Sayfalar">
          <button className={`${btn} border border-line text-ink-soft hover:text-ink disabled:opacity-40`} disabled={page === 1} onClick={() => go(page - 1)} aria-label="Önceki sayfa">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {nums.map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-ink-soft">
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => go(n)}
                aria-current={n === page ? "page" : undefined}
                className={`${btn} ${n === page ? "bg-ink text-white" : "border border-line text-ink hover:border-ink-soft"}`}
              >
                {n}
              </button>
            ),
          )}
          <button className={`${btn} border border-line text-ink-soft hover:text-ink disabled:opacity-40`} disabled={page === pages} onClick={() => go(page + 1)} aria-label="Sonraki sayfa">
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}

/** Filtre seçimi: ilk seçenek her zaman "Tümü" (değer "") ve varsayılan odur */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  counts,
}: {
  label: string;
  value: T | "";
  options: [T, string][];
  onChange: (v: T | "") => void;
  counts?: Partial<Record<T | "", number>>;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
        className="h-10 min-w-[150px] rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink focus:border-ink focus:outline-none"
      >
        <option value="">Tümü{counts?.[""] != null ? ` (${counts[""]})` : ""}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
            {counts?.[v] != null ? ` (${counts[v]})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Sekme şeklinde filtre: ilk sekme "Tümü" */
export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
  counts,
}: {
  value: T | "";
  options: [T, string][];
  onChange: (v: T | "") => void;
  counts?: Partial<Record<T | "", number>>;
}) {
  const all: [T | "", string][] = [["", "Tümü"], ...options];
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {all.map(([v, l]) => (
        <button
          key={v || "all"}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
            value === v ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:text-ink"
          }`}
        >
          {l}
          {counts?.[v] != null && (
            <span className={`rounded-full px-1.5 text-[11px] font-bold ${value === v ? "bg-white/20" : "bg-paper"}`}>{counts[v]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative grid min-w-[220px] flex-1 gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">Ara</span>
      <span className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm focus:border-ink focus:outline-none"
        />
      </span>
    </label>
  );
}

/** Beyaz tablo kartı (Elasoft tablo düzeni) */
export function TablePanel({ toolbar, footer, children }: { toolbar?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-[0_1px_2px_rgba(22,23,28,.05)]">
      {toolbar && <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">{toolbar}</div>}
      <div className="overflow-x-auto">{children}</div>
      {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
    </section>
  );
}
export const th = "px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft whitespace-nowrap";
export const td = "px-4 py-3 align-middle text-sm";

// ---------------------------------------------------------------- Avatar

/** Hazır avatarlar: Emlook paletinden zemin + basit simge (p01–p12) */
const PRESETS: Record<string, { bg: string; fg: string; shape: "house" | "key" | "door" | "window" | "roof" | "tree" | "sun" | "wave" | "star" | "leaf" | "compass" | "building" }> = {
  p01: { bg: "#c8283f", fg: "#fffdfb", shape: "house" },
  p02: { bg: "#16171c", fg: "#fffdfb", shape: "key" },
  p03: { bg: "#fbe7ea", fg: "#a51f33", shape: "door" },
  p04: { bg: "#e3f4ec", fg: "#1f8a5b", shape: "tree" },
  p05: { bg: "#fdf1dc", fg: "#a8670a", shape: "sun" },
  p06: { bg: "#5b5d66", fg: "#fffdfb", shape: "building" },
  p07: { bg: "#a51f33", fg: "#fbe7ea", shape: "roof" },
  p08: { bg: "#f6f3ef", fg: "#16171c", shape: "window" },
  p09: { bg: "#1f8a5b", fg: "#e3f4ec", shape: "leaf" },
  p10: { bg: "#e6e1da", fg: "#5b5d66", shape: "compass" },
  p11: { bg: "#16171c", fg: "#c8283f", shape: "star" },
  p12: { bg: "#fbe7ea", fg: "#16171c", shape: "wave" },
};
export const AVATAR_PRESET_IDS = Object.keys(PRESETS);

function PresetShape({ shape, color }: { shape: string; color: string }) {
  const p = { fill: "none", stroke: color, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (shape) {
    case "house": return <path {...p} d="M8 20 L20 10 L32 20 M11 18 V30 H29 V18 M17 30 V23 H23 V30" />;
    case "key": return <g {...p}><circle cx="15" cy="20" r="5" /><path d="M20 20 H32 M28 20 V24 M31 20 V23" /></g>;
    case "door": return <g {...p}><rect x="13" y="9" width="14" height="22" rx="2" /><circle cx="23" cy="20" r="1.2" fill={color} /></g>;
    case "window": return <g {...p}><rect x="10" y="10" width="20" height="20" rx="2" /><path d="M20 10 V30 M10 20 H30" /></g>;
    case "roof": return <path {...p} d="M7 24 L20 11 L33 24 M12 19 V30 H28 V19" />;
    case "tree": return <g {...p}><path d="M20 9 L28 22 H12 Z" /><path d="M20 22 V31" /></g>;
    case "sun": return <g {...p}><circle cx="20" cy="20" r="5" /><path d="M20 8 V11 M20 29 V32 M8 20 H11 M29 20 H32 M11.5 11.5 L13.6 13.6 M26.4 26.4 L28.5 28.5 M11.5 28.5 L13.6 26.4 M26.4 13.6 L28.5 11.5" /></g>;
    case "wave": return <path {...p} d="M8 17 Q14 12 20 17 T32 17 M8 24 Q14 19 20 24 T32 24" />;
    case "star": return <path {...p} d="M20 9 L23 16.5 L31 17 L25 22 L27 30 L20 25.5 L13 30 L15 22 L9 17 L17 16.5 Z" />;
    case "leaf": return <path {...p} d="M11 29 C11 17 18 11 30 10 C29 22 23 29 11 29 Z M11 29 L22 18" />;
    case "compass": return <g {...p}><circle cx="20" cy="20" r="11" /><path d="M24 16 L21.5 21.5 L16 24 L18.5 18.5 Z" /></g>;
    default: return <g {...p}><rect x="12" y="9" width="16" height="22" rx="1.5" /><path d="M16 14 H18 M22 14 H24 M16 19 H18 M22 19 H24 M16 24 H18 M22 24 H24" /></g>;
  }
}

export type AvatarInfo = { kind: "photo"; url: string } | { kind: "preset"; preset: string } | null | undefined;

export function Avatar({ avatar, name, size = 36, className = "" }: { avatar: AvatarInfo; name?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (avatar?.kind === "photo") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fileUrl(avatar.url)} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  if (avatar?.kind === "preset" && PRESETS[avatar.preset]) {
    const d = PRESETS[avatar.preset]!;
    return (
      <svg viewBox="0 0 40 40" style={style} className={`shrink-0 rounded-full ${className}`} aria-hidden>
        <rect width="40" height="40" fill={d.bg} />
        <PresetShape shape={d.shape} color={d.fg} />
      </svg>
    );
  }
  const initials = (name ?? "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toLocaleUpperCase("tr-TR")).join("");
  return (
    <span style={{ ...style, fontSize: Math.max(10, size * 0.36) }} className={`inline-grid shrink-0 place-items-center rounded-full bg-brand-tint font-bold text-brand-ink ${className}`} aria-hidden>
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------- Rozet

interface Tier {
  key: string;
  label: string;
  minScore: number;
  color: string;
}
const TIER_STYLE: Record<string, string> = {
  brand: "bg-brand text-white",
  ink: "bg-ink text-white",
  ok: "bg-ok text-white",
  warn: "bg-warn text-white",
  gold: "bg-[linear-gradient(135deg,#f6d77a,#c9952b)] text-[#3d2a05]",
  silver: "bg-[linear-gradient(135deg,#eef0f3,#b9bec7)] text-[#2b2f36]",
  bronze: "bg-[linear-gradient(135deg,#f0c39d,#b4703f)] text-[#3a1f0b]",
};

export function useBadgeTiers() {
  return useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api<{ badgeTiers: Tier[]; announcement: string | null }>("/settings/public"),
    staleTime: 5 * 60_000,
  }).data?.badgeTiers;
}

/** Danışman rozeti (puana göre; tanımlar yönetim ayarlarından) */
export function BadgeChip({ badge, score, size = "sm" }: { badge: string | null | undefined; score?: number; size?: "xs" | "sm" }) {
  const tiers = useBadgeTiers();
  if (!badge) return null;
  const tier = tiers?.find((t) => t.key === badge);
  if (!tier) return null;
  return (
    <span
      title={score != null ? `${tier.label} rozeti · ${score} puan` : `${tier.label} rozeti`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold ${TIER_STYLE[tier.color] ?? TIER_STYLE.ink} ${
        size === "xs" ? "h-[18px] px-1.5 text-[10px]" : "h-[22px] px-2.5 text-[11px]"
      }`}
    >
      <svg viewBox="0 0 16 16" className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden>
        <path fill="currentColor" d="M8 1 L9.8 5.3 L14.5 5.7 L10.9 8.7 L12 13.3 L8 10.8 L4 13.3 L5.1 8.7 L1.5 5.7 L6.2 5.3 Z" />
      </svg>
      {tier.label}
    </span>
  );
}
export { TIER_STYLE };
