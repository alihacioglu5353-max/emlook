"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, type FollowState, type PersonCard, type Reaction } from "@/lib/api";
import { VerifiedIcon } from "./ui";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Beğen ve kaydet düğmeleri. İyimser günceller; hata olursa eski hâline döner.
 * Sonuçta akış/detay önbellekleri bayatlatılır ki diğer görünümler de tazelensin.
 */
export function Reactions({
  listingId,
  initial,
  compact,
}: {
  listingId: string;
  initial: Omit<Reaction, "listingId">;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(kind: "like" | "save") {
    if (busy) return;
    const prev = state;
    const on = kind === "like" ? !state.likedByMe : !state.savedByMe;
    setState((s) =>
      kind === "like"
        ? { ...s, likedByMe: on, likeCount: s.likeCount + (on ? 1 : -1) }
        : { ...s, savedByMe: on },
    );
    setBusy(true);
    try {
      const next = await api<Reaction>(`/listings/${listingId}/${kind}`, {
        method: on ? "POST" : "DELETE",
      });
      setState(next);
      void qc.invalidateQueries({ queryKey: ["listing", listingId] });
      if (kind === "save") void qc.invalidateQueries({ queryKey: ["saved"] });
    } catch {
      setState(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={state.likedByMe}
        aria-label={state.likedByMe ? "Beğeniyi geri al" : "Beğen"}
        onClick={() => toggle("like")}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition",
          state.likedByMe ? "text-brand" : "text-ink-soft hover:text-ink",
          !compact && "border border-line bg-surface px-4 py-2",
        )}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
          <path
            d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"
            fill={state.likedByMe ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        <span className="tabular-nums">{state.likeCount}</span>
      </button>
      <button
        type="button"
        aria-pressed={state.savedByMe}
        aria-label={state.savedByMe ? "Kaydedilenlerden çıkar" : "Kaydet"}
        onClick={() => toggle("save")}
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition",
          state.savedByMe ? "text-ink" : "text-ink-soft hover:text-ink",
          !compact && "border border-line bg-surface px-4 py-2",
        )}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
          <path
            d="M6.5 4.5h11v15.5L12 16.3 6.5 20z"
            fill={state.savedByMe ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        {!compact && (state.savedByMe ? "Kaydedildi" : "Kaydet")}
      </button>
    </div>
  );
}

/** Takip et / takibi bırak */
export function FollowButton({
  agentId,
  initial,
  onChange,
  size = "md",
}: {
  agentId: string;
  initial: boolean;
  onChange?: (s: FollowState) => void;
  size?: "sm" | "md";
}) {
  const qc = useQueryClient();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const next = await api<FollowState>(`/agents/${agentId}/follow`, {
        method: following ? "DELETE" : "POST",
      });
      setFollowing(next.followedByMe);
      onChange?.(next);
      void qc.invalidateQueries({ queryKey: ["feed"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition disabled:opacity-60",
        size === "sm" ? "h-8 px-3.5 text-xs" : "h-10 px-5 text-sm",
        following
          ? "border border-line bg-surface text-ink hover:border-brand hover:text-brand"
          : "bg-ink text-white hover:bg-black",
      )}
    >
      {following ? "Takiptesin" : "Takip et"}
    </button>
  );
}

/** Öneri ve takipçi listelerinde kişi satırı */
export function PersonRow({ person, canFollow }: { person: PersonCard; canFollow: boolean }) {
  const place = [person.district, person.city].filter(Boolean).join(", ");
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar name={person.fullName} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/danisman/${person.id}`}
          className="flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          <span className="truncate">{person.fullName ?? "Kullanıcı"}</span>
          {person.isVerified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0 text-[#2f7de1]" />}
        </Link>
        <p className="truncate text-xs text-ink-soft">
          {person.isAgent ? (person.officeName ?? "Bağımsız") : "Mülk sahibi"}
          {place && ` · ${place}`}
          {person.isAgent && ` · ${person.activeListingCount} ilan`}
        </p>
      </div>
      {canFollow && person.isAgent && (
        <FollowButton agentId={person.id} initial={person.followedByMe} size="sm" />
      )}
    </li>
  );
}

export function Avatar({ name, size = 40 }: { name: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("tr"))
    .join("");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-brand-ink"
    >
      {initials}
    </span>
  );
}
