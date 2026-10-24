"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PhotoPlaceholder } from "@/components/listing-card";
import { Avatar } from "@/components/social";
import { Alert, Button, EmptyState, Eyebrow, Spinner, VerifiedIcon } from "@/components/ui";
import { api, fileUrl, type InterestItem, type InterestList, type InterestStatus } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { DEAL_LABEL, formatPrice } from "@/lib/listing";
import { useAction } from "@/lib/use-action";

type Side = "incoming" | "outgoing";

const STATUS: Record<InterestStatus, { label: string; tone: string }> = {
  pending: { label: "Bekliyor", tone: "bg-warn-tint text-warn" },
  accepted: { label: "Eşleşti", tone: "bg-ok-tint text-ok" },
  declined: { label: "Reddedildi", tone: "bg-paper text-ink-soft border border-line" },
  withdrawn: { label: "Geri çekildi", tone: "bg-paper text-ink-soft border border-line" },
};

export default function InterestsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Interests />
    </Suspense>
  );
}

function Interests() {
  const params = useSearchParams();
  const router = useRouter();
  const side: Side = params.get("yon") === "giden" ? "outgoing" : "incoming";
  const [status, setStatus] = useState<InterestStatus | "">("");
  const qc = useQueryClient();
  const action = useAction();
  const key = ["interests", side, status];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<InterestList>(`/interests/${side}${status ? `?status=${status}` : ""}`),
  });

  async function act(id: string, verb: "accept" | "decline" | "withdraw") {
    await action.run(`${verb}:${id}`, async () => {
      await api(`/interests/${id}/${verb}`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["interests"] });
    });
  }

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Eyebrow>Eşleşme</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Talepler</h1>
        <p className="mt-1 text-ink-soft">
          {side === "incoming"
            ? "İlanlarınla ilgilenen danışmanlar ve alıcılar. Kabul ettiğinde eşleşirsiniz."
            : "İlgini ilettiğin ilanlar ve yanıtları."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line bg-paper p-1" role="tablist">
          {(["incoming", "outgoing"] as Side[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={side === s}
              onClick={() => {
                setStatus("");
                router.replace(s === "outgoing" ? "/talepler?yon=giden" : "/talepler");
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                side === s ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              {s === "incoming" ? "Gelen" : "Gönderdiğim"}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <button className={chip(status === "")} onClick={() => setStatus("")}>
          Tümü
        </button>
        {(Object.keys(STATUS) as InterestStatus[]).map((s) => (
          <button key={s} className={chip(status === s)} onClick={() => setStatus(s)}>
            {STATUS[s].label}
            {q.data && <span className="ml-1.5 opacity-70">{q.data.counts[s]}</span>}
          </button>
        ))}
      </div>

      {action.error && <Alert tone="error">{action.error}</Alert>}

      {q.isError ? (
        <Alert tone="error">{q.error.message}</Alert>
      ) : !q.data ? (
        <Spinner />
      ) : q.data.items.length === 0 ? (
        <EmptyState>
          {side === "incoming" ? (
            "Henüz talep yok. Portföyün yayında oldukça burada görünecek."
          ) : (
            <>
              Henüz ilgi göndermedin.{" "}
              <Link href="/kesfet" className="font-semibold text-brand hover:underline">
                Keşfet&apos;e git
              </Link>
            </>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((i) => (
            <InterestRow key={i.id} item={i} side={side} busy={action.busy} onAct={act} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InterestRow({
  item,
  side,
  busy,
  onAct,
}: {
  item: InterestItem;
  side: Side;
  busy: string | null;
  onAct: (id: string, verb: "accept" | "decline" | "withdraw") => void;
}) {
  const person =
    side === "incoming"
      ? { id: item.requester.id, name: item.requester.fullName, verified: item.requester.isVerified, sub: item.requester.isAgent ? "Danışman" : "Alıcı / mülk arayan" }
      : { id: item.owner.id, name: item.owner.fullName, verified: false, sub: "İlan sahibi" };
  const s = STATUS[item.status];

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex gap-4 p-4">
        <Link href={`/ilan/${item.listing.id}`} className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-paper">
          {item.listing.coverPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(item.listing.coverPhoto)} alt="" className="h-full w-full object-cover" />
          ) : (
            <PhotoPlaceholder className="h-full w-full" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.tone}`}>{s.label}</span>
            {item.fromDiscover && (
              <span className="text-[11px] font-semibold text-ink-soft">Keşfet&apos;ten</span>
            )}
            <span className="text-xs text-ink-soft">{timeAgo(item.createdAt)}</span>
          </div>
          <Link href={`/ilan/${item.listing.id}`} className="mt-1 line-clamp-1 font-semibold hover:underline">
            {item.listing.title}
          </Link>
          <p className="text-sm text-ink-soft">
            {DEAL_LABEL[item.listing.dealType]} · {formatPrice(item.listing.price, item.listing.dealType)} ·{" "}
            {item.listing.location.district}, {item.listing.location.city}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-paper/50 px-4 py-3">
        <Link href={`/danisman/${person.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
          <Avatar name={person.name} size={32} />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-semibold">
              <span className="truncate">{person.name ?? "Kullanıcı"}</span>
              {person.verified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0 text-[#2f7de1]" />}
            </span>
            <span className="block text-xs text-ink-soft">{person.sub}</span>
          </span>
        </Link>
        {item.status === "pending" && side === "incoming" && (
          <>
            <Button
              variant="ghost"
              className="!h-9"
              loading={busy === `decline:${item.id}`}
              onClick={() => onAct(item.id, "decline")}
            >
              Reddet
            </Button>
            <Button className="!h-9" loading={busy === `accept:${item.id}`} onClick={() => onAct(item.id, "accept")}>
              Kabul et
            </Button>
          </>
        )}
        {item.status === "pending" && side === "outgoing" && (
          <Button
            variant="ghost"
            className="!h-9"
            loading={busy === `withdraw:${item.id}`}
            onClick={() => onAct(item.id, "withdraw")}
          >
            Geri çek
          </Button>
        )}
        {item.status === "accepted" && (
          <span className="text-sm font-semibold text-ok">Eşleştiniz · mesajlaşma yakında</span>
        )}
      </div>
      {item.note && (
        <p className="border-t border-line px-4 py-3 text-sm">
          <span className="font-semibold">Not: </span>
          {item.note}
        </p>
      )}
    </li>
  );
}
