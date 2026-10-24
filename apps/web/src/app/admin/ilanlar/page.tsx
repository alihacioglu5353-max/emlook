"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ReasonAction } from "@/components/admin";
import { FilterSelect, PAGE_SIZE, Pagination } from "@/components/data-ui";
import { ListingStatusBadge } from "@/components/listing-card";
import { Alert, Button, EmptyState, Spinner } from "@/components/ui";
import { api, type AdminListingRow, type EidsStatus, type ListingStatus } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { DEAL_LABEL, EIDS_LABEL, formatPrice, LISTING_STATUS_LABEL } from "@/lib/listing";
import { useAction } from "@/lib/use-action";

const PAGE = PAGE_SIZE;

export default function AdminListingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AdminListings />
    </Suspense>
  );
}

function AdminListings() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const action = useAction();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ListingStatus | "">("");
  const [eids, setEids] = useState<EidsStatus | "">((params.get("eids") as EidsStatus | null) ?? "");
  const [offset, setOffset] = useState(0);

  const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  if (eids) qs.set("eids", eids);
  const list = useQuery({
    queryKey: ["admin-listings", qs.toString()],
    queryFn: () => api<{ items: AdminListingRow[]; total: number }>(`/admin/listings?${qs}`),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-listings"] });
    void qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-soft">Moderasyon ve EİDS elle doğrulama.</p>
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setOffset(0);
          setQ(text.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input
          type="search"
          aria-label="Başlık, danışman veya taşınmaz no"
          placeholder="Başlık, danışman veya taşınmaz no"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-10 min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-4 text-sm focus:border-ink focus:outline-none"
        />
        <FilterSelect<ListingStatus>
          label="Durum"
          value={status}
          options={(Object.keys(LISTING_STATUS_LABEL) as ListingStatus[]).map((x) => [x, LISTING_STATUS_LABEL[x]])}
          onChange={(v) => { setStatus(v); setOffset(0); }}
        />
        <FilterSelect<EidsStatus>
          label="EİDS"
          value={eids}
          options={(Object.keys(EIDS_LABEL) as EidsStatus[]).map((x) => [x, EIDS_LABEL[x]])}
          onChange={(v) => { setEids(v); setOffset(0); }}
        />
        <Button type="submit" variant="secondary" className="!h-10">
          Ara
        </Button>
      </form>

      {action.error && <Alert tone="error">{action.error}</Alert>}

      {list.isError ? (
        <Alert tone="error">{list.error.message}</Alert>
      ) : !list.data ? (
        <Spinner />
      ) : list.data.items.length === 0 ? (
        <EmptyState>İlan bulunamadı.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {list.data.items.map((l) => (
              <li key={l.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ListingStatusBadge status={l.status} />
                      <span className={`text-xs font-semibold ${l.eidsStatus === "verified" ? "text-ok" : l.eidsStatus === "pending" ? "text-warn" : "text-ink-soft"}`}>
                        EİDS: {EIDS_LABEL[l.eidsStatus]}
                      </span>
                      {l.isDemo && <span className="text-xs font-semibold text-warn">Deneme</span>}
                      {l.openReports > 0 && (
                        <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand-ink">
                          {l.openReports} şikâyet
                        </span>
                      )}
                    </div>
                    <Link href={`/ilan/${l.id}`} className="mt-1 block font-semibold hover:underline">
                      {l.title}
                    </Link>
                    <p className="text-sm text-ink-soft">
                      {DEAL_LABEL[l.dealType]} · {formatPrice(l.price, l.dealType)} · {l.district}, {l.city} ·{" "}
                      <Link href={`/admin/kullanicilar/${l.owner.id}`} className="hover:underline">
                        {l.owner.fullName}
                      </Link>
                      {l.owner.status === "suspended" && " (askıda)"} · {timeAgo(l.createdAt)}
                    </p>
                    {l.propertyNumber && (
                      <p className="text-xs text-ink-soft">
                        Taşınmaz no {l.propertyNumber} · Yetki belgesi {l.licenseNumber ?? "—"}
                      </p>
                    )}
                    {l.removedReason && <p className="mt-1 text-sm text-brand">Kaldırma gerekçesi: {l.removedReason}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {l.eidsStatus !== "verified" && l.propertyNumber && (
                      <>
                        <Button
                          className="!h-9"
                          variant="secondary"
                          loading={action.busy === `eids-ok:${l.id}`}
                          onClick={() =>
                            action.run(`eids-ok:${l.id}`, async () => {
                              await api(`/admin/listings/${l.id}/eids`, { json: { decision: "verified" } });
                              refresh();
                            })
                          }
                        >
                          EİDS onayla
                        </Button>
                        <ReasonAction
                          label="EİDS reddet"
                          variant="ghost"
                          minLength={0}
                          placeholder="Danışmana gösterilecek açıklama"
                          confirmLabel="Reddet"
                          busy={action.busy === `eids-no:${l.id}`}
                          onSubmit={(message) =>
                            action.run(`eids-no:${l.id}`, async () => {
                              await api(`/admin/listings/${l.id}/eids`, { json: { decision: "failed", message: message || undefined } });
                              refresh();
                            })
                          }
                        />
                      </>
                    )}
                    {l.status === "removed" ? (
                      <Button
                        className="!h-9"
                        variant="ghost"
                        loading={action.busy === `restore:${l.id}`}
                        onClick={() =>
                          action.run(`restore:${l.id}`, async () => {
                            await api(`/admin/listings/${l.id}/restore`, { method: "POST" });
                            refresh();
                          })
                        }
                      >
                        Geri yükle
                      </Button>
                    ) : (
                      <ReasonAction
                        label="Kaldır"
                        placeholder="Kaldırma gerekçesi (danışmana bildirilir)"
                        confirmLabel="Yayından kaldır"
                        busy={action.busy === `remove:${l.id}`}
                        onSubmit={(reason) =>
                          action.run(`remove:${l.id}`, async () => {
                            await api(`/admin/listings/${l.id}/remove`, { json: { reason } });
                            refresh();
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination total={list.data.total} offset={offset} pageSize={PAGE} onChange={setOffset} />
        </>
      )}
    </div>
  );
}
