"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { EidsBadge, PhotoPlaceholder } from "@/components/listing-card";
import { Avatar } from "@/components/social";
import { Alert, Eyebrow, Spinner, VerifiedIcon } from "@/components/ui";
import {
  api,
  fileUrl,
  type City,
  type DealType,
  type DiscoverResponse,
  type ListingCard,
} from "@/lib/api";
import { CATEGORY_LABEL, DEAL_LABEL, formatLocation, formatPrice } from "@/lib/listing";

type Decision = "like" | "pass";
const THRESHOLD = 110;

export default function DiscoverPage() {
  const qc = useQueryClient();
  const [deal, setDeal] = useState<DealType | "">("");
  const [city, setCity] = useState("");
  const [queue, setQueue] = useState<ListingCard[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const busy = useRef(false);

  const cities = useQuery({
    queryKey: ["loc", "cities"],
    queryFn: () => api<City[]>("/locations/cities"),
    staleTime: Infinity,
  });

  const load = useCallback(
    async (replace: boolean) => {
      const params = new URLSearchParams({ limit: "10" });
      if (deal) params.set("dealType", deal);
      if (city) params.set("cityCode", city);
      try {
        const res = await api<DiscoverResponse>(`/discover?${params}`);
        setCanUndo(res.canUndo);
        setQueue((prev) => {
          const base = replace ? [] : prev;
          const seen = new Set(base.map((x) => x.id));
          return [...base, ...res.items.filter((x) => !seen.has(x.id))];
        });
        setExhausted(res.items.length === 0);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [deal, city],
  );

  // Filtre değişince baştan yükle
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const current = queue[0];

  const decide = useCallback(
    async (decision: Decision) => {
      if (!current || busy.current) return;
      busy.current = true;
      setLeaving(decision);
      try {
        await api(`/discover/${current.id}/swipe`, { json: { decision } });
        // Kart animasyonu bitsin
        await new Promise((r) => setTimeout(r, 180));
        setQueue((q) => q.slice(1));
        setCanUndo(true);
        if (decision === "like") {
          setToast("İlgin ilan sahibine iletildi");
          void qc.invalidateQueries({ queryKey: ["interests"] });
        }
        if (queue.length <= 3) void load(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setQueue((q) => q.slice(1));
      } finally {
        setLeaving(null);
        busy.current = false;
      }
    },
    [current, queue.length, load, qc],
  );

  async function undo() {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await api<{ restored: ListingCard | null; canUndo: boolean }>("/discover/undo", {
        method: "POST",
      });
      setCanUndo(res.canUndo);
      if (res.restored) {
        const restored = res.restored;
        setQueue((q) => [restored, ...q.filter((x) => x.id !== restored.id)]);
        setExhausted(false);
      }
      void qc.invalidateQueries({ queryKey: ["interests"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  }

  // Klavye: ← geç, → ilgileniyorum, Backspace geri al
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") void decide("pass");
      if (e.key === "ArrowRight") void decide("like");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <Eyebrow>Keşfet</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Senin için portföyler</h1>
        <p className="mt-1 text-ink-soft">
          Sağa kaydır ya da ♥ ile ilan sahibine ilgini ilet; sola kaydırarak geç. Klavyede ← →.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([["", "Tümü"], ["sale", "Satılık"], ["rent", "Kiralık"]] as const).map(([v, label]) => (
          <button key={v} aria-pressed={deal === v} onClick={() => setDeal(v)} className={chip(deal === v)}>
            {label}
          </button>
        ))}
        <select
          aria-label="İl"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink-soft focus:border-ink focus:outline-none"
        >
          <option value="">Tümü</option>
          {cities.data?.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="relative h-[clamp(400px,60vh,560px)]">
        {loading ? (
          <Spinner />
        ) : current ? (
          <>
            {queue[1] && (
              <div className="absolute inset-0 translate-y-3 scale-[0.96] opacity-60" aria-hidden>
                <CardFace item={queue[1]} />
              </div>
            )}
            <SwipeCard key={current.id} item={current} leaving={leaving} onDecide={decide} />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-lg font-bold">Şimdilik bu kadar</p>
            <p className="mt-1 text-sm text-ink-soft">
              {exhausted
                ? "Filtrene uyan yeni portföy kalmadı. Filtreyi değiştir ya da sonra tekrar bak."
                : "Kartlar yükleniyor…"}
            </p>
            <Link href="/talepler?yon=giden" className="mt-4 text-sm font-semibold text-brand hover:underline">
              Gönderdiğim ilgiler →
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-5">
        <RoundButton label="Geç" disabled={!current} onClick={() => decide("pass")} tone="pass">
          <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </RoundButton>
        <RoundButton label="Geri al" disabled={!canUndo} onClick={undo} tone="undo" small>
          <path
            d="M9 7 5 11l4 4M5.5 11H14a5 5 0 0 1 0 10h-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </RoundButton>
        <RoundButton label="İlgileniyorum" disabled={!current} onClick={() => decide("like")} tone="like">
          <path
            d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"
            fill="currentColor"
          />
        </RoundButton>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** Sürüklenebilir üst kart */
function SwipeCard({
  item,
  leaving,
  onDecide,
}: {
  item: ListingCard;
  leaving: Decision | null;
  onDecide: (d: Decision) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  function down(e: RPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a,button")) return;
    start.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    if (start.current !== null) setDx(e.clientX - start.current);
  }
  function up() {
    if (start.current === null) return;
    start.current = null;
    setDragging(false);
    if (dx > THRESHOLD) onDecide("like");
    else if (dx < -THRESHOLD) onDecide("pass");
    else setDx(0);
  }

  const x = leaving === "like" ? 600 : leaving === "pass" ? -600 : dx;
  const hint = x > 40 ? "like" : x < -40 ? "pass" : null;

  return (
    <div
      className="absolute inset-0 touch-pan-y select-none"
      style={{
        transform: `translateX(${x}px) rotate(${x / 25}deg)`,
        transition: dragging ? "none" : "transform 200ms ease-out",
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <CardFace item={item} />
      {hint && (
        <span
          className={`absolute top-8 rounded-xl border-4 px-4 py-1 text-2xl font-extrabold uppercase tracking-wide ${
            hint === "like"
              ? "left-6 -rotate-12 border-ok text-ok"
              : "right-6 rotate-12 border-brand text-brand"
          }`}
          style={{ opacity: Math.min(1, Math.abs(x) / THRESHOLD) }}
        >
          {hint === "like" ? "İlgileniyorum" : "Geç"}
        </span>
      )}
    </div>
  );
}

function CardFace({ item }: { item: ListingCard }) {
  const specs = [
    item.rooms,
    item.netM2 ? `${item.netM2} m² net` : item.grossM2 ? `${item.grossM2} m²` : null,
    CATEGORY_LABEL[item.category],
  ].filter(Boolean);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_10px_30px_-12px_rgba(22,23,28,0.25)]">
      <div className="relative min-h-0 flex-1 bg-paper">
        {item.coverPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl(item.coverPhoto)}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <PhotoPlaceholder className="h-full w-full" />
        )}
        <div className="absolute left-4 top-4 flex gap-1.5">
          <span className="rounded-full bg-ink/85 px-3 py-1 text-xs font-bold text-white">
            {DEAL_LABEL[item.dealType]}
          </span>
          {item.isDemo && (
            <span className="rounded-full bg-warn-tint px-3 py-1 text-xs font-bold text-warn">Deneme</span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pt-16 text-white">
          <p className="text-3xl font-extrabold tracking-tight">{formatPrice(item.price, item.dealType)}</p>
          <p className="mt-0.5 line-clamp-1 font-semibold">{item.title}</p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-ink-soft">{specs.join(" · ")}</span>
          {item.eidsVerified && <EidsBadge />}
        </div>
        <p className="text-sm text-ink-soft">{formatLocation(item.location)}</p>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <Link href={`/danisman/${item.owner.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
            <Avatar name={item.owner.fullName} size={30} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-semibold">
                <span className="truncate">{item.owner.fullName}</span>
                {item.owner.isVerified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0 text-[#2f7de1]" />}
              </span>
              <span className="block truncate text-xs text-ink-soft">{item.owner.officeName ?? "Bağımsız"}</span>
            </span>
          </Link>
          {item.cobrokeShare !== null && item.cobrokeShare > 0 && (
            <span className="shrink-0 rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand-ink">
              Paylaşım %{item.cobrokeShare}
            </span>
          )}
          <Link href={`/ilan/${item.id}`} className="shrink-0 text-sm font-semibold text-ink-soft hover:text-ink">
            Detay →
          </Link>
        </div>
      </div>
    </article>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  tone,
  small,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: "pass" | "like" | "undo";
  small?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    pass: "text-brand hover:bg-brand-tint",
    like: "bg-brand text-white hover:bg-brand-ink border-transparent",
    undo: "text-ink-soft hover:text-ink",
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-full border border-line bg-surface shadow-sm transition disabled:opacity-35 ${
        small ? "h-12 w-12" : "h-16 w-16"
      } ${tones[tone]}`}
    >
      <svg viewBox="0 0 24 24" className={small ? "h-5 w-5" : "h-7 w-7"} aria-hidden>
        {children}
      </svg>
    </button>
  );
}
