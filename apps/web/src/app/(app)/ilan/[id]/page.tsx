"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMe } from "@/components/app-shell";
import { useState } from "react";
import { EidsBadge, ListingStatusBadge, PhotoPlaceholder } from "@/components/listing-card";
import { useStartConversation } from "@/components/chat";
import { Avatar, FollowButton, Reactions } from "@/components/social";
import { Alert, Button, Card, Spinner, Textarea, VerifiedIcon } from "@/components/ui";
import { api, fileUrl, type AgentProfileCard, type InterestItem, type ListingDetail } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { DEAL_LABEL, formatLocation, formatPrice } from "@/lib/listing";

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api<ListingDetail>(`/listings/${id}`),
  });
  const [active, setActive] = useState(0);
  const { me } = useMe();

  const l = query.data;
  if (!l) {
    return query.isError ? (
      <Alert tone="error" title="İlan görüntülenemiyor">
        {query.error.message}
      </Alert>
    ) : (
      <Spinner />
    );
  }

  const photo = l.photos[Math.min(active, l.photos.length - 1)];
  const specs: [string, string | null][] = [
    ["İlan tipi", DEAL_LABEL[l.dealType]],
    ["Kategori", l.categoryLabel],
    ["Oda", l.rooms],
    ["Brüt m²", l.grossM2 ? `${l.grossM2} m²` : null],
    ["Net m²", l.netM2 ? `${l.netM2} m²` : null],
    ["Kat", l.floor],
    ["Bina yaşı", l.buildingAge !== null ? String(l.buildingAge) : null],
    ["Yayın tarihi", l.publishedAt ? formatDate(l.publishedAt) : null],
  ];

  return (
    <div className="space-y-6">
      {l.isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            Bu senin ilanın <ListingStatusBadge status={l.status} />
          </span>
          <Link href={`/panel/portfoy/${l.id}`} className="font-semibold text-brand hover:underline">
            İlanı yönet →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-paper">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(photo.url)} alt={l.title} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <PhotoPlaceholder className="aspect-[4/3] w-full" />
            )}
            {l.photos.length > 1 && (
              <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-0.5 text-xs font-semibold text-white">
                {active + 1} / {l.photos.length}
              </span>
            )}
          </div>
          {l.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {l.photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={`Fotoğraf ${i + 1}`}
                  aria-current={i === active}
                  onClick={() => setActive(i)}
                  className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    i === active ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(p.url)} alt="" loading="lazy" className="h-16 w-24 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="!p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold text-white">
                {DEAL_LABEL[l.dealType]}
              </span>
              {l.eids.verified && <EidsBadge />}
              {l.isDemo && (
                <span className="rounded-full bg-warn-tint px-2.5 py-0.5 text-[11px] font-bold text-warn">
                  Deneme ilanı
                </span>
              )}
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight">
              {formatPrice(l.price, l.dealType)}
            </p>
            <h1 className="mt-1 text-lg font-semibold">{l.title}</h1>
            <p className="mt-1 text-sm text-ink-soft">{formatLocation(l.location)}</p>
            {l.status === "active" && (
              <div className="mt-4">
                <Reactions
                  key={`${l.likeCount}-${l.likedByMe}-${l.savedByMe}`}
                  listingId={l.id}
                  initial={{ likeCount: l.likeCount, likedByMe: l.likedByMe, savedByMe: l.savedByMe }}
                />
              </div>
            )}
            {l.cobrokeShare !== null && (
              <div className="mt-4 rounded-xl bg-brand-tint p-3 text-sm text-brand-ink">
                <p className="font-bold">Komisyon paylaşımı: %{l.cobrokeShare}</p>
                <p className="text-xs">
                  Alıcıyı getiren danışmana ödenecek pay. Yalnızca danışmanlar görür.
                </p>
              </div>
            )}
          </Card>

          <Card className="!p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Danışman</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={l.owner.fullName} size={44} />
              <Link href={`/danisman/${l.owner.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="flex items-center gap-1.5 font-semibold">
                  {l.owner.fullName ?? "Danışman"}
                  {l.owner.isVerified && (
                    <VerifiedIcon className="h-4 w-4 text-[#2f7de1]" aria-label="Onaylı danışman" />
                  )}
                </span>
                <span className="block text-sm text-ink-soft">
                  {l.owner.office?.name ?? "Bağımsız danışman"}
                </span>
              </Link>
              {!l.isOwner && me.role !== "admin" && (
                <OwnerFollow agentId={l.owner.id} />
              )}
            </div>
            {!l.isOwner && l.status === "active" && me.role !== "admin" && (
              <>
                <InterestBox listingId={l.id} />
                <WriteToOwner ownerId={l.owner.id} listingId={l.id} />
              </>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="text-lg font-bold">Açıklama</h2>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">
            {l.description || "Açıklama eklenmemiş."}
          </p>
        </Card>
        <Card className="!p-6">
          <h2 className="text-lg font-bold">Özellikler</h2>
          <dl className="mt-3 divide-y divide-line text-sm">
            {specs
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

/** Detayda takip düğmesi: güncel durumu danışman kartından okur */
function OwnerFollow({ agentId }: { agentId: string }) {
  const q = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => api<AgentProfileCard>(`/agents/${agentId}`),
  });
  if (!q.data) return null;
  return <FollowButton key={String(q.data.followedByMe)} agentId={agentId} initial={q.data.followedByMe} size="sm" />;
}

/** "İlgileniyorum": ilan sahibine el sıkışma isteği */
function InterestBox({ listingId }: { listingId: string }) {
  const qc = useQueryClient();
  const key = ["my-interest", listingId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<{ interest: InterestItem | null }>(`/listings/${listingId}/interest`),
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["interests"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!q.data) return null;
  const i = q.data.interest;
  return (
    <div className="mt-5 border-t border-line pt-4">
      {i?.status === "accepted" ? (
        <p className="rounded-xl bg-ok-tint p-3 text-sm font-semibold text-ok">
          Eşleştiniz.{" "}
          {i.conversationId && (
            <Link href={`/mesajlar/${i.conversationId}`} className="underline">
              Mesajlaşmaya git
            </Link>
          )}
        </p>
      ) : i?.status === "pending" ? (
        <div className="space-y-2">
          <p className="rounded-xl bg-warn-tint p-3 text-sm text-warn">
            <span className="font-semibold">İlgin iletildi.</span> İlan sahibinin yanıtı bekleniyor.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => api(`/interests/${i.id}/withdraw`, { method: "POST" }))}
            className="text-sm font-semibold text-ink-soft hover:text-ink"
          >
            Geri çek
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea
            aria-label="İlan sahibine not"
            placeholder="İsteğe bağlı not: alıcım hazır, hafta sonu gösterim…"
            maxLength={500}
            rows={2}
            className="!min-h-0 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            className="w-full"
            loading={busy}
            onClick={() => run(() => api(`/listings/${listingId}/interest`, { json: { note: note.trim() || undefined } }))}
          >
            İlgileniyorum
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-brand">{error}</p>}
    </div>
  );
}

/** İlan kartıyla birlikte danışmana mesaj */
function WriteToOwner({ ownerId, listingId }: { ownerId: string; listingId: string }) {
  const chat = useStartConversation();
  return (
    <div className="mt-3">
      <Button variant="ghost" className="w-full" loading={chat.busy} onClick={() => chat.start(ownerId, listingId)}>
        Danışmana mesaj gönder
      </Button>
      {chat.error && <p className="mt-2 text-sm text-brand">{chat.error}</p>}
    </div>
  );
}
