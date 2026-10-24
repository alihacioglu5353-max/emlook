"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/components/app-shell";
import { ListingCard, ListingStatusBadge } from "@/components/listing-card";
import { Alert, EmptyState, Eyebrow, Spinner } from "@/components/ui";
import { api, type ListingStatus, type MyListings } from "@/lib/api";

const TABS: { key: ListingStatus | "all"; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Yayında" },
  { key: "draft", label: "Taslak" },
  { key: "passive", label: "Pasif" },
  { key: "sold", label: "Satıldı" },
];

export default function PortfolioPage() {
  const { me } = useMe();
  const [tab, setTab] = useState<ListingStatus | "all">("all");
  const query = useQuery({
    queryKey: ["my-listings", tab],
    queryFn: () =>
      api<MyListings>(`/listings/mine?limit=100${tab === "all" ? "" : `&status=${tab}`}`),
    enabled: me.role === "agent",
  });

  if (me.role !== "agent") return <Alert>Portföy yönetimi emlak danışmanları içindir.</Alert>;
  const verified = me.agent?.isVerified ?? false;
  const counts = query.data?.counts;
  const total = counts ? counts.draft + counts.active + counts.passive + counts.sold : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Portföy</Eyebrow>
          <h1 className="text-3xl font-extrabold tracking-tight">Portföyüm</h1>
          {counts && (
            <p className="mt-2 text-ink-soft">
              {counts.sale} satılık · {counts.rent} kiralık
            </p>
          )}
        </div>
        {verified && (
          <Link
            href="/panel/portfoy/yeni"
            className="inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-ink"
          >
            + Yeni ilan
          </Link>
        )}
      </div>

      {!verified && (
        <Alert tone="warn" title="İlan girmek için danışman onayı gerekiyor">
          Onaylandığında portföyünü ekleyip ağla paylaşabilirsin.{" "}
          <Link href="/panel/basvuru" className="font-semibold underline">
            Başvuruna git
          </Link>
        </Alert>
      )}

      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map((t) => {
          const n = counts ? (t.key === "all" ? total : counts[t.key]) : null;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === t.key ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
              {n !== null && <span className="ml-1.5 opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {query.isError ? (
        <Alert tone="error">{query.error.message}</Alert>
      ) : !query.data ? (
        <Spinner />
      ) : query.data.items.length === 0 ? (
        <EmptyState>
          {tab === "all" ? "Henüz ilan eklemedin." : "Bu durumda ilan yok."}
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.items.map((item) => (
            <ListingCard
              key={item.id}
              item={item}
              href={`/panel/portfoy/${item.id}`}
              topRight={<ListingStatusBadge status={item.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
