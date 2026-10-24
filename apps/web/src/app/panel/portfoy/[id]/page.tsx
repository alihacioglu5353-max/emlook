"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { EidsBadge, ListingStatusBadge } from "@/components/listing-card";
import { ListingForm } from "@/components/listing-form";
import { Alert, Button, Card, Eyebrow, Spinner } from "@/components/ui";
import { api, fileUrl, type ListingDetail } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { DEAL_LABEL, EIDS_LABEL, formatLocation, formatPrice } from "@/lib/listing";
import { useAction } from "@/lib/use-action";

const MAX_PHOTOS = 20;
const MAX_BYTES = 10 * 1024 * 1024;

export default function ManageListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ["listing", id];
  const query = useQuery({ queryKey: key, queryFn: () => api<ListingDetail>(`/listings/${id}`) });
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const l = query.data;
  if (!l) return query.isError ? <Alert tone="error">{query.error.message}</Alert> : <Spinner />;
  if (!l.isOwner) {
    return <Alert tone="error">Bu ilanı yalnızca sahibi yönetebilir.</Alert>;
  }

  const editable = ["draft", "active", "passive"].includes(l.status);
  const eidsStatus = l.eids.status ?? "unverified";

  function apply(next: ListingDetail) {
    qc.setQueryData(key, next);
    void qc.invalidateQueries({ queryKey: ["my-listings"] });
  }
  const call = (k: string, path: string, init?: Parameters<typeof api>[1]) =>
    action.run(k, async () => apply(await api<ListingDetail>(path, init ?? { method: "POST" })));

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!l || files.length === 0) return;
    const room = MAX_PHOTOS - l.photos.length;
    const chosen = files.slice(0, room);
    await action.run("upload", async () => {
      for (const [i, file] of chosen.entries()) {
        if (file.size > MAX_BYTES) throw new Error(`${file.name}: dosya 10 MB'den büyük`);
        setUploading(`${i + 1} / ${chosen.length}`);
        const form = new FormData();
        form.append("file", file);
        apply(await api<ListingDetail>(`/listings/${id}/photos`, { form }));
      }
      if (files.length > room) throw new Error(`En fazla ${MAX_PHOTOS} fotoğraf eklenebilir`);
    });
    setUploading(null);
  }

  function move(index: number, to: number) {
    if (!l) return;
    const ids = l.photos.map((p) => p.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(to, 0, moved);
    void call(`order:${moved}`, `/listings/${id}/photos/order`, { method: "PUT", json: { ids } });
  }

  const checklist = [
    { done: l.photos.length > 0, label: "En az bir fotoğraf" },
    {
      done: l.eids.verified || l.isDemo,
      label: l.isDemo ? "Deneme ilanı (EİDS gerekmez)" : "EİDS yetki doğrulaması",
    },
  ];
  const publishable = checklist.every((c) => c.done);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/portfoy" className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← Portföyüm
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Eyebrow>{DEAL_LABEL[l.dealType]} · {l.categoryLabel}</Eyebrow>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight">{l.title}</h1>
            <p className="mt-1 text-ink-soft">
              {formatPrice(l.price, l.dealType)} · {formatLocation(l.location)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ListingStatusBadge status={l.status} />
              {l.eids.verified && <EidsBadge />}
              {l.isDemo && (
                <span className="rounded-full bg-warn-tint px-2.5 py-0.5 text-[11px] font-bold text-warn">
                  Deneme
                </span>
              )}
              <span className="text-xs text-ink-soft">Güncellendi {timeAgo(l.updatedAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {l.status !== "draft" && (
              <Link
                href={`/ilan/${l.id}`}
                className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold hover:border-ink-soft"
              >
                İlanı görüntüle
              </Link>
            )}
            {(l.status === "draft" || l.status === "passive") && (
              <Button
                disabled={!publishable}
                loading={action.busy === "publish"}
                onClick={() => call("publish", `/listings/${id}/publish`)}
              >
                {l.status === "draft" ? "Yayına al" : "Tekrar yayına al"}
              </Button>
            )}
            {l.status === "active" && (
              <Button
                variant="ghost"
                loading={action.busy === "deactivate"}
                onClick={() => call("deactivate", `/listings/${id}/deactivate`)}
              >
                Pasife al
              </Button>
            )}
            {(l.status === "active" || l.status === "passive") && (
              <Button
                variant="secondary"
                loading={action.busy === "sold"}
                onClick={() => {
                  if (confirm(l.dealType === "rent" ? "İlan kiralandı olarak kapatılsın mı?" : "İlan satıldı olarak kapatılsın mı?"))
                    void call("sold", `/listings/${id}/sold`);
                }}
              >
                {l.dealType === "rent" ? "Kiralandı" : "Satıldı"}
              </Button>
            )}
            {l.status === "draft" && (
              <Button
                variant="danger"
                loading={action.busy === "delete"}
                onClick={() => {
                  if (!confirm("Taslak ilan ve fotoğrafları silinsin mi?")) return;
                  void action.run("delete", async () => {
                    await api(`/listings/${id}`, { method: "DELETE" });
                    qc.removeQueries({ queryKey: key });
                    void qc.invalidateQueries({ queryKey: ["my-listings"] });
                    router.replace("/panel/portfoy");
                  });
                }}
              >
                Sil
              </Button>
            )}
          </div>
        </div>
      </div>

      {action.error && <Alert tone="error">{action.error}</Alert>}
      {l.status === "removed" && (
        <Alert tone="error" title="İlan yönetici tarafından kaldırıldı">
          {l.removedReason}
        </Alert>
      )}

      {(l.status === "draft" || l.status === "passive") && (
        <Card className="!p-5">
          <p className="text-sm font-semibold">Yayın şartları</p>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {checklist.map((c) => (
              <li key={c.label} className={c.done ? "text-ok" : "text-ink-soft"}>
                {c.done ? "✓" : "○"} {c.label}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Fotoğraflar</h2>
              <p className="text-sm text-ink-soft">
                {l.photos.length} / {MAX_PHOTOS} · ilk fotoğraf kapak olur · JPG, PNG, WebP
              </p>
            </div>
            {editable && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  onChange={onFiles}
                />
                <Button
                  variant="ghost"
                  disabled={l.photos.length >= MAX_PHOTOS}
                  loading={action.busy === "upload"}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading ? `Yükleniyor ${uploading}` : "Fotoğraf ekle"}
                </Button>
              </>
            )}
          </div>
          {l.photos.length === 0 ? (
            <button
              type="button"
              disabled={!editable}
              onClick={() => fileInput.current?.click()}
              className="mt-5 flex aspect-[16/7] w-full items-center justify-center rounded-xl border-2 border-dashed border-line text-sm font-semibold text-ink-soft hover:border-ink-soft/50 hover:text-ink"
            >
              Fotoğraf seç
            </button>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {l.photos.map((p, i) => (
                <li key={p.id} className="group relative overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(p.url)} alt={`Fotoğraf ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                      Kapak
                    </span>
                  )}
                  {editable && (
                    <div className="flex items-center justify-between gap-1 border-t border-line bg-surface px-2 py-1.5 text-xs font-semibold">
                      <div className="flex gap-1">
                        <IconBtn label="Sola taşı" disabled={i === 0} onClick={() => move(i, i - 1)}>
                          ←
                        </IconBtn>
                        <IconBtn
                          label="Sağa taşı"
                          disabled={i === l.photos.length - 1}
                          onClick={() => move(i, i + 1)}
                        >
                          →
                        </IconBtn>
                        {i > 0 && (
                          <button
                            type="button"
                            className="rounded-md px-1.5 text-ink-soft hover:text-ink"
                            onClick={() => move(i, 0)}
                          >
                            Kapak yap
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="rounded-md px-1.5 text-brand hover:bg-brand-tint"
                        disabled={action.busy === `rm:${p.id}`}
                        onClick={() =>
                          call(`rm:${p.id}`, `/listings/${id}/photos/${p.id}`, { method: "DELETE" })
                        }
                      >
                        Kaldır
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-bold">EİDS doğrulaması</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Yetki belgen ile taşınmaz arasındaki yetkilendirme Elektronik İlan Doğrulama
            Sistemi&apos;nden kontrol edilir.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Taşınmaz no</dt>
              <dd className="font-semibold">{l.eids.propertyNumber ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Durum</dt>
              <dd
                className={`font-semibold ${
                  eidsStatus === "verified" ? "text-ok" : eidsStatus === "failed" ? "text-brand" : ""
                }`}
              >
                {EIDS_LABEL[eidsStatus]}
              </dd>
            </div>
            {l.eids.checkedAt && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Son kontrol</dt>
                <dd>{timeAgo(l.eids.checkedAt)}</dd>
              </div>
            )}
          </dl>
          {l.eids.message && <p className="mt-3 rounded-lg bg-paper p-3 text-sm">{l.eids.message}</p>}
          {!l.eids.verified && editable && (
            <Button
              className="mt-4 w-full"
              variant="secondary"
              disabled={!l.eids.propertyNumber || eidsStatus === "pending"}
              loading={action.busy === "eids"}
              onClick={() => call("eids", `/listings/${id}/eids-verify`)}
            >
              {eidsStatus === "failed" ? "Tekrar doğrula" : "EİDS ile doğrula"}
            </Button>
          )}
          {!l.eids.propertyNumber && editable && (
            <p className="mt-2 text-xs text-ink-soft">
              Doğrulama için önce bilgilerden taşınmaz numarasını girin.
            </p>
          )}
        </Card>
      </div>

      {editable && (
        <div>
          {editing ? (
            <ListingForm
              listing={l}
              submitLabel="Değişiklikleri kaydet"
              onSubmit={async (input) => {
                const next = await api<ListingDetail>(`/listings/${id}`, { method: "PATCH", json: input });
                apply(next);
                setEditing(false);
              }}
            />
          ) : (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Bilgileri düzenle
            </Button>
          )}
          {editing && (
            <button
              type="button"
              className="mt-3 text-sm font-semibold text-ink-soft hover:text-ink"
              onClick={() => setEditing(false)}
            >
              Vazgeç
            </button>
          )}
          {l.status === "active" && editing && !l.isDemo && (
            <p className="mt-2 text-xs text-ink-soft">
              Taşınmaz numarasını değiştirirsen EİDS onayı sıfırlanır ve ilan taslağa döner.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 rounded-md text-ink-soft hover:bg-paper hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}
