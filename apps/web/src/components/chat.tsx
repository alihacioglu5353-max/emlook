"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  api,
  fileUrl,
  type ChatMessage,
  type ConversationSummary,
  type MessagePage,
} from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { DEAL_LABEL, formatPrice } from "@/lib/listing";
import { PhotoPlaceholder } from "./listing-card";
import { Avatar } from "./social";
import { Alert, Spinner, VerifiedIcon } from "./ui";

export const CONVERSATIONS_KEY = ["conversations"] as const;
export const UNREAD_KEY = ["conversations-unread"] as const;

/** Okunmamış konuşma sayısı (menü rozeti) */
export function useUnreadMessages(enabled: boolean) {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => api<{ conversations: number; messages: number }>("/conversations/unread"),
    refetchInterval: 30_000,
    enabled,
  });
}

/** Konuşma başlatır (veya var olanı açar) ve sayfaya gider */
export function useStartConversation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start(userId: string, listingId?: string) {
    setBusy(true);
    setError(null);
    try {
      const c = await api<ConversationSummary>("/conversations", { json: { userId, listingId } });
      router.push(`/mesajlar/${c.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { start, busy, error };
}

export function ConversationList({ activeId }: { activeId?: string }) {
  const q = useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => api<ConversationSummary[]>("/conversations"),
    refetchInterval: 15_000,
  });
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  if (q.data.length === 0) {
    return (
      <p className="p-5 text-sm text-ink-soft">
        Henüz konuşma yok. Bir danışmanın profilinden ya da ilan detayından mesaj gönderebilirsin.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {q.data.map((c) => {
        const last = c.lastMessage;
        const preview = !last
          ? "Konuşma başladı"
          : last.kind === "listing"
            ? `İlan: ${last.body}`
            : last.kind === "system"
              ? last.body
              : `${last.mine ? "Sen: " : ""}${last.body}`;
        return (
          <li key={c.id}>
            <Link
              href={`/mesajlar/${c.id}`}
              aria-current={c.id === activeId ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3.5 transition ${
                c.id === activeId ? "bg-paper" : "hover:bg-paper/60"
              }`}
            >
              <Avatar name={c.other.fullName} size={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 font-semibold">
                    <span className="truncate">{c.other.fullName ?? "Kullanıcı"}</span>
                    {c.other.isVerified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0 text-[#2f7de1]" />}
                  </span>
                  {last && <span className="shrink-0 text-[11px] text-ink-soft">{timeAgo(last.createdAt)}</span>}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread ? "font-semibold text-ink" : "text-ink-soft"}`}>
                    {preview}
                  </span>
                  {c.unread > 0 && (
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const POLL_MS = 4000;

export function Thread({ id }: { id: string }) {
  const qc = useQueryClient();
  const summary = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api<ConversationSummary>(`/conversations/${id}`),
  });
  const history = useInfiniteQuery({
    queryKey: ["messages", id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<MessagePage>(`/conversations/${id}/messages${pageParam ? `?cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Sayfalar en yeniden eskiye gelir; ekranda eskiden yeniye
  const older = history.data ? [...history.data.pages].reverse().flatMap((p) => p.items) : [];
  const seen = new Set(older.map((m) => m.id));
  const all = [...older, ...live.filter((m) => !seen.has(m.id))];
  const lastCursor = all.at(-1)?.cursor;

  // Yeni mesaj yoklaması
  useEffect(() => {
    if (!history.data) return;
    const t = setInterval(async () => {
      try {
        const res = await api<MessagePage>(
          `/conversations/${id}/messages${lastCursor ? `?after=${lastCursor}` : ""}`,
        );
        if (res.items.length > 0) {
          setLive((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            return [...prev, ...res.items.filter((m) => !ids.has(m.id))];
          });
        }
      } catch {
        // Ağ kesintisi: bir sonraki turda yeniden denenir
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [id, lastCursor, history.data]);

  // Açıkken okundu say
  const count = all.length;
  useEffect(() => {
    if (count === 0) return;
    void api(`/conversations/${id}/read`, { method: "POST" }).then(() => {
      void qc.invalidateQueries({ queryKey: UNREAD_KEY });
      void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    });
  }, [id, count, qc]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api<ChatMessage[]>(`/conversations/${id}/messages`, { json: { text: body } });
      setLive((prev) => [...prev, ...created]);
      setText("");
      void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  if (summary.isError) return <Alert tone="error">{summary.error.message}</Alert>;
  const other = summary.data?.other;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link href="/mesajlar" className="text-ink-soft hover:text-ink md:hidden" aria-label="Konuşmalar">
          ←
        </Link>
        {other && (
          <Link href={`/danisman/${other.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
            <Avatar name={other.fullName} size={36} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-semibold">
                <span className="truncate">{other.fullName}</span>
                {other.isVerified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0 text-[#2f7de1]" />}
              </span>
              <span className="block truncate text-xs text-ink-soft">
                {other.isAgent ? (other.officeName ?? "Bağımsız danışman") : "Mülk sahibi / alıcı"}
              </span>
            </span>
          </Link>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {history.hasNextPage && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => history.fetchNextPage()}
              className="text-xs font-semibold text-ink-soft hover:text-ink"
            >
              {history.isFetchingNextPage ? "Yükleniyor…" : "Daha eski mesajlar"}
            </button>
          </div>
        )}
        {!history.data ? <Spinner /> : all.map((m) => <Bubble key={m.id} m={m} />)}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
        <textarea
          aria-label="Mesaj"
          rows={1}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Mesaj yaz…"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-[15px] focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-ink disabled:opacity-50"
        >
          Gönder
        </button>
      </form>
      {error && <p className="px-4 pb-3 text-sm text-brand">{error}</p>}
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

function Bubble({ m }: { m: ChatMessage }) {
  if (m.kind === "system") {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <p className="max-w-md rounded-full bg-ok-tint px-4 py-1.5 text-center text-xs font-semibold text-ok">{m.body}</p>
        {m.listing && <ListingMini l={m.listing} />}
      </div>
    );
  }
  return (
    <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] ${m.mine ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {m.kind === "listing" ? (
          m.listing ? (
            <ListingMini l={m.listing} />
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-2 text-sm text-ink-soft">
              İlan artık görüntülenemiyor
            </p>
          )
        ) : (
          <p
            className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-[15px] ${
              m.mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-line bg-surface"
            }`}
          >
            {m.body}
          </p>
        )}
        <span className="text-[10px] text-ink-soft">{timeFmt.format(new Date(m.createdAt))}</span>
      </div>
    </div>
  );
}

function ListingMini({ l }: { l: NonNullable<ChatMessage["listing"]> }) {
  return (
    <Link
      href={`/ilan/${l.id}`}
      className="flex w-72 max-w-full items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-2 hover:border-ink-soft/40"
    >
      <span className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-paper">
        {l.coverPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(l.coverPhoto)} alt="" className="h-full w-full object-cover" />
        ) : (
          <PhotoPlaceholder className="h-full w-full" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{l.title}</span>
        <span className="block text-xs text-ink-soft">
          {DEAL_LABEL[l.dealType]} · {formatPrice(l.price, l.dealType)}
        </span>
      </span>
    </Link>
  );
}
