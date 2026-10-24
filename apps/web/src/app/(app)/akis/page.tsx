"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/components/app-shell";
import { ListingGrid } from "@/components/listing-grid";
import { PersonRow } from "@/components/social";
import { Eyebrow } from "@/components/ui";
import { api, type DealType, type PersonCard } from "@/lib/api";

type Scope = "all" | "network";

export default function FeedPage() {
  const { me } = useMe();
  const [scope, setScope] = useState<Scope>("all");
  const [deal, setDeal] = useState<DealType | "">("");
  const suggestions = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => api<PersonCard[]>("/me/suggestions"),
  });

  const params = new URLSearchParams({ scope, limit: "18" });
  if (deal) params.set("dealType", deal);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Akış</Eyebrow>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {scope === "all" ? "Emlook Ağı" : "Benim Ağım"}
            </h1>
            <p className="mt-1 text-ink-soft">
              {scope === "all"
                ? "Görebildiğin tüm yeni portföyler, en yenisi önce."
                : "Takip ettiğin danışmanların ve ofis arkadaşlarının portföyleri."}
            </p>
          </div>
          {me.role === "agent" && me.agent?.isVerified && (
            <Link
              href="/panel/portfoy/yeni"
              className="inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-ink"
            >
              + İlan ekle
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="tablist" aria-label="Akış">
            {(["all", "network"] as Scope[]).map((s) => (
              <button key={s} role="tab" aria-selected={scope === s} onClick={() => setScope(s)} className={chip(scope === s)}>
                {s === "all" ? "Emlook Ağı" : "Benim Ağım"}
              </button>
            ))}
          </div>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
          <div className="flex gap-1" aria-label="İlan tipi">
            {([["", "Tümü"], ["sale", "Satılık"], ["rent", "Kiralık"]] as const).map(([v, label]) => (
              <button key={v} aria-pressed={deal === v} onClick={() => setDeal(v)} className={chip(deal === v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <ListingGrid
          queryKey={["feed", scope, deal]}
          path={`/feed?${params}`}
          empty={
            scope === "network"
              ? "Ağında henüz yayında ilan yok. Sağdaki önerilerden danışman takip et."
              : "Henüz yayında ilan yok."
          }
        />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-bold">Takip önerileri</h2>
          {suggestions.data?.length ? (
            <ul className="mt-1 divide-y divide-line">
              {suggestions.data.map((p) => (
                <PersonRow key={p.id} person={p} canFollow />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">
              {suggestions.isLoading ? "Yükleniyor…" : "Şimdilik öneri yok."}
            </p>
          )}
        </section>
        <Link
          href="/kaydedilenler"
          className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 text-sm font-semibold hover:border-ink-soft/40"
        >
          Kaydettiğim ilanlar <span aria-hidden>→</span>
        </Link>
      </aside>
    </div>
  );
}
