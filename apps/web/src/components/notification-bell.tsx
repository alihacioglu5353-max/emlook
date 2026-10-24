"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type NotificationItem, type Role } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const KEY = ["notifications"] as const;

/** Bildirimin yönlendireceği sayfa */
function targetOf(n: NotificationItem, role: Role | null): string | null {
  const data = n.data ?? {};
  if (n.type === "social.followed" && typeof data.userId === "string") return `/danisman/${data.userId}`;
  if (n.type === "listing.liked" && typeof data.listingId === "string") return `/ilan/${data.listingId}`;
  if (!n.type.startsWith("office.")) return null;
  const managerTypes = [
    "office.join_requested",
    "office.invite_accepted",
    "office.invite_declined",
    "office.member_left",
    "office.member_transferred",
  ];
  if (role === "agent" && managerTypes.includes(n.type)) return "/panel/ofis/yonet";
  return "/panel/ofis";
}

/**
 * Üst çubuktaki bildirim zili. Okunmamış sayısı dakikada bir yenilenir
 * (E7'de anlık bildirime geçilecek).
 */
export function NotificationBell({ role }: { role: Role | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const list = useQuery({
    queryKey: KEY,
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>("/notifications?limit=15"),
    refetchInterval: 60_000,
  });
  const unread = list.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.readAt) {
      await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: KEY });
    }
    const to = targetOf(n, role);
    if (to) router.push(to);
  }

  async function readAll() {
    await api("/notifications/read-all", { method: "POST" });
    void qc.invalidateQueries({ queryKey: KEY });
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-paper hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-20 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-bold">Bildirimler</p>
            {unread > 0 && (
              <button onClick={readAll} className="text-xs font-semibold text-ink-soft hover:text-brand">
                Tümünü okundu say
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {list.data?.items.length ? (
              list.data.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className="flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-paper"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      <span className="block text-sm text-ink-soft">{n.body}</span>
                      <span className="mt-1 block text-xs text-ink-soft/80">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-sm text-ink-soft">Henüz bildirim yok.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
