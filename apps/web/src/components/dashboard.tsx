"use client";

import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * Yönetim paneli bileşenleri — Elasoft yönetim paneli düzeni, Emlook renkleri:
 * beyaz kart + ince çizgi + hafif gölge, büyük harfli etiketler, kırmızı vurgu.
 */

export function Panel({
  title,
  subtitle,
  actions,
  footer,
  padding = true,
  className = "",
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  padding?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`grid min-w-0 grid-rows-[auto_1fr_auto] rounded-[10px] border border-line bg-surface shadow-[0_1px_2px_rgba(22,23,28,.05)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 px-6 pb-3 pt-5">
          <div className="grid min-w-0 gap-0.5">
            {title && <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={padding ? `px-6 pb-6 ${title || actions ? "" : "pt-6"}` : ""}>{children}</div>
      {footer && <footer className="flex items-center gap-3 border-t border-line px-6 py-3">{footer}</footer>}
    </section>
  );
}

export function StatCard({
  label,
  value,
  unit,
  delta,
  tone,
  icon: Icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: string;
  tone?: "up" | "down" | "flat";
  icon: LucideIcon;
  hint?: ReactNode;
}) {
  const t = tone ?? (delta?.trim().startsWith("-") ? "down" : "up");
  const DeltaIcon = t === "down" ? TrendingDown : t === "flat" ? Minus : TrendingUp;
  return (
    <div className="grid min-w-0 gap-3 rounded-[10px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(22,23,28,.05)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</span>
        <Icon className="h-[18px] w-[18px] text-brand" aria-hidden />
      </div>
      <div className="flex items-baseline gap-2">
        <strong className="text-[28px] font-extrabold leading-none tracking-tight text-ink tabular-nums">{value}</strong>
        {unit && <span className="text-sm text-ink-soft">{unit}</span>}
      </div>
      {(delta || hint) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {delta && (
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                t === "down" ? "text-brand" : t === "flat" ? "text-ink-soft" : "text-ok"
              }`}
            >
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
              {delta}
            </span>
          )}
          {hint && <span className="text-ink-soft">{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "ok" | "warn" | "solid"; children: ReactNode }) {
  const cls = {
    neutral: "bg-paper text-ink-soft border border-line",
    brand: "bg-brand-tint text-brand-ink",
    ok: "bg-ok-tint text-ok",
    warn: "bg-warn-tint text-warn",
    solid: "bg-brand text-white",
  }[tone];
  return (
    <span className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-bold ${cls}`}>
      {children}
    </span>
  );
}

/** Sekmeli segment düğmeleri (grafik ölçüsünü değiştirmek için) */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-paper p-0.5" role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={`h-7 rounded-md px-2.5 text-xs font-bold transition ${
            v === value ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Alanı boyalı çizgi grafik; ikinci seri koyu kesikli çizgi */
export function LineChart({
  labels,
  series,
  height = 220,
  format = (n: number) => String(n),
}: {
  labels: string[];
  series: { name: string; values: number[]; tone: "brand" | "ink" }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const h = height;
  const padX = 10;
  const padTop = 14;
  const padBottom = 26;
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.15;
  const n = labels.length;
  const x = (i: number) => padX + (i * (w - padX * 2)) / Math.max(1, n - 1);
  const y = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);
  const line = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = series[0]!;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label={series.map((s) => `${s.name}: ${s.values.join(", ")}`).join(" · ")}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * w;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((rel - padX) / (w - padX * 2)) * (n - 1)))));
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={w} y1={padTop + f * (h - padTop - padBottom)} y2={padTop + f * (h - padTop - padBottom)} stroke="var(--line)" strokeWidth="1" />
        ))}
        <polygon points={`${x(0)},${h - padBottom} ${line(first.values)} ${x(n - 1)},${h - padBottom}`} fill={`url(#${gid})`} />
        {series.map((s) => (
          <polyline
            key={s.name}
            points={line(s.values)}
            fill="none"
            stroke={s.tone === "brand" ? "var(--brand)" : "var(--ink)"}
            strokeWidth={s.tone === "brand" ? 2.5 : 1.8}
            strokeDasharray={s.tone === "ink" ? "5 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={h - padBottom} stroke="var(--ink-soft)" strokeOpacity=".35" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* Noktalar ve etiketler HTML ile: SVG ölçeklenince bozulmasın */}
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }}>
        {series.map((s) =>
          s.values.map((v, i) =>
            i === hover || (s.tone === "brand" && i === n - 1) ? (
              <span
                key={s.name + i}
                className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface ${s.tone === "brand" ? "border-brand" : "border-ink"}`}
                style={{ left: `${(x(i) / w) * 100}%`, top: y(v) }}
              />
            ) : null,
          ),
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-soft tabular-nums">
        {labels.map((l, i) => (
          <span key={l + i} className={i % 2 === 1 && n > 8 ? "hidden sm:inline" : ""}>
            {l}
          </span>
        ))}
      </div>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min(85, Math.max(15, (x(hover) / w) * 100))}%` }}
        >
          <p className="mb-1 font-bold text-ink">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 text-ink-soft">
              <span className={`h-2 w-2 rounded-full ${s.tone === "brand" ? "bg-brand" : "bg-ink"}`} />
              {s.name}: <strong className="text-ink tabular-nums">{format(s.values[hover]!)}</strong>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Halka grafik: kırmızı + mürekkep tonları */
export const DONUT_COLORS = ["var(--brand)", "var(--ink)", "var(--ink-soft)", "rgba(22,23,28,.28)", "var(--line)", "var(--brand-tint)"];

export function Donut({ slices, center, caption }: { slices: { label: string; value: number }[]; center: ReactNode; caption: string }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const ends = slices.map((_, i) => (slices.slice(0, i + 1).reduce((a, s) => a + s.value, 0) / total) * 100);
  const stops = slices.map((_, i) => `${DONUT_COLORS[i % DONUT_COLORS.length]} ${i ? ends[i - 1] : 0}% ${ends[i]}%`).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-[150px] w-[150px] shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }} role="img" aria-label={slices.map((s) => `${s.label} ${s.value}`).join(", ")}>
        <div className="absolute inset-[24%] grid place-items-center rounded-full bg-surface text-center">
          <div>
            <div className="text-2xl font-extrabold leading-none text-ink tabular-nums">{center}</div>
            <div className="mt-1 text-[10.5px] text-ink-soft">{caption}</div>
          </div>
        </div>
      </div>
      <ul className="grid min-w-[150px] flex-1 gap-2.5">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-black/5" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="flex-1 text-ink-soft">{s.label}</span>
            <strong className="text-ink tabular-nums">{s.value}</strong>
            <span className="w-10 text-right text-ink-soft tabular-nums">%{Math.round((s.value / total) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kırmızı / mürekkep dönüşümlü sütun grafik */
export function BarChart({ data, height = 170, format = String }: { data: { label: string; value: number; sub?: string }[]; height?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.1;
  return (
    <div className="flex items-end gap-3 sm:gap-5" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="grid h-full flex-1 content-end justify-items-center gap-1.5" title={d.sub}>
          <span className="whitespace-nowrap text-[10px] font-semibold text-ink-soft tabular-nums">{format(d.value)}</span>
          <div
            className={`w-full max-w-[34px] rounded-t-[3px] ${i % 2 === 0 ? "bg-brand" : "bg-ink"}`}
            style={{ height: Math.max(3, (d.value / max) * (height - 44)) }}
          />
          <span className="text-[10.5px] text-ink-soft">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Progress({ label, value, max, right, tone = "brand" }: { label: ReactNode; value: number; max: number; right?: ReactNode; tone?: "brand" | "ink" | "ok" | "warn" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bar = { brand: "bg-brand", ink: "bg-ink", ok: "bg-ok", warn: "bg-warn" }[tone];
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-ink-soft tabular-nums">{right ?? value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
