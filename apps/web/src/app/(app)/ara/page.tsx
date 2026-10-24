"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import { ListingCard } from "@/components/listing-card";
import { PersonRow, Reactions } from "@/components/social";
import { Alert, Button, EmptyState, Eyebrow, Spinner } from "@/components/ui";
import {
  api,
  type City,
  type ListingCategory,
  type NamedId,
  type PersonCard,
  type SearchResult,
} from "@/lib/api";
import { CATEGORY_LABEL, DEAL_LABEL, formatPrice, sortTr } from "@/lib/listing";

const KEYS = [
  "q",
  "dealType",
  "category",
  "rooms",
  "minPrice",
  "maxPrice",
  "minM2",
  "maxM2",
  "cityCode",
  "districtId",
  "sort",
] as const;
type Key = (typeof KEYS)[number];

const ROOMS = ["Stüdyo", "1+1", "2+1", "3+1", "4+1", "5+1"];
const PAGE = 18;

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Search />
    </Suspense>
  );
}

function Search() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [showFilters, setShowFilters] = useState(false);
  const get = (k: Key) => params.get(k) ?? "";
  const [text, setText] = useState(get("q"));

  /** URL'yi tek kaynak olarak günceller (paylaşılabilir arama) */
  function setParams(patch: Partial<Record<Key, string>>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  const query = new URLSearchParams();
  for (const k of KEYS) if (params.get(k)) query.set(k, params.get(k)!);
  const qs = query.toString();

  const results = useInfiniteQuery({
    queryKey: ["search", qs],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<SearchResult>(`/search?${qs}${qs ? "&" : ""}limit=${PAGE}&offset=${pageParam}`),
    getNextPageParam: (last) => last.nextOffset,
  });
  const agents = useQuery({
    queryKey: ["search-agents", get("q")],
    queryFn: () => api<PersonCard[]>(`/search/agents?q=${encodeURIComponent(get("q"))}`),
    enabled: get("q").trim().length >= 2,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    // Yeni serbest metin aramasında ayrıştırılan filtreler yeniden hesaplanır
    setParams({ q: text.trim() });
  }

  const first = results.data?.pages[0];
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const activeFilters = KEYS.filter((k) => k !== "q" && k !== "sort" && params.get(k)).length;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Arama</Eyebrow>
        <form onSubmit={submit} className="flex gap-2" role="search">
          <input
            type="search"
            aria-label="Portföy ara"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="örn. kadıköy satılık 3+1 10 milyon altı"
            className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-5 text-[16px] focus:border-ink focus:outline-none"
          />
          <Button type="submit" className="!h-14 !rounded-2xl px-7">
            Ara
          </Button>
        </form>
        {first && <Understood parsed={first.parsed} />}
      </div>

      {agents.data && agents.data.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface px-5 pt-3">
          <h2 className="text-sm font-bold">Danışmanlar</h2>
          <ul className="grid divide-y divide-line sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
            {agents.data.slice(0, 4).map((p) => (
              <PersonRow key={p.id} person={p} canFollow />
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="mb-3 inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold lg:hidden"
            aria-expanded={showFilters}
          >
            Filtreler{activeFilters > 0 && ` (${activeFilters})`}
          </button>
          <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
            <Filters get={get} setParams={setParams} />
          </aside>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              {first ? (
                <>
                  <span className="font-bold text-ink">{first.total.toLocaleString("tr-TR")}</span> ilan
                </>
              ) : (
                " "
              )}
            </p>
            <select
              aria-label="Sıralama"
              value={get("sort") || "new"}
              onChange={(e) => setParams({ sort: e.target.value === "new" ? "" : e.target.value })}
              className="h-10 rounded-full border border-line bg-surface px-4 text-sm font-semibold focus:border-ink focus:outline-none"
            >
              <option value="new">En yeni</option>
              <option value="price_asc">Fiyat: artan</option>
              <option value="price_desc">Fiyat: azalan</option>
            </select>
          </div>

          {results.isError ? (
            <Alert tone="error">{results.error.message}</Alert>
          ) : !results.data ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState>Bu aramaya uyan ilan bulunamadı. Filtreleri gevşetmeyi dene.</EmptyState>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <ListingCard
                    key={item.id}
                    item={item}
                    href={`/ilan/${item.id}`}
                    footer={
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{item.owner.fullName}</span>
                        <Reactions
                          listingId={item.id}
                          compact
                          initial={{ likeCount: item.likeCount, likedByMe: item.likedByMe, savedByMe: item.savedByMe }}
                        />
                      </div>
                    }
                  />
                ))}
              </div>
              {results.hasNextPage && (
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    loading={results.isFetchingNextPage}
                    onClick={() => results.fetchNextPage()}
                  >
                    Daha fazla göster
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Serbest metinden anlaşılan filtreleri gösterir */
function Understood({ parsed }: { parsed: SearchResult["parsed"] }) {
  const chips: string[] = [];
  if (parsed.district) chips.push(`${parsed.district.name}, ${parsed.city?.name ?? ""}`);
  else if (parsed.city) chips.push(parsed.city.name);
  if (parsed.dealType) chips.push(DEAL_LABEL[parsed.dealType]);
  if (parsed.category) chips.push(CATEGORY_LABEL[parsed.category]);
  if (parsed.rooms) chips.push(parsed.rooms);
  if (parsed.minPrice !== null && parsed.maxPrice !== null)
    chips.push(`${formatPrice(parsed.minPrice)} – ${formatPrice(parsed.maxPrice)}`);
  else if (parsed.maxPrice !== null) chips.push(`en fazla ${formatPrice(parsed.maxPrice)}`);
  else if (parsed.minPrice !== null) chips.push(`en az ${formatPrice(parsed.minPrice)}`);
  if (parsed.minM2 !== null && parsed.maxM2 !== null) chips.push(`${parsed.minM2}–${parsed.maxM2} m²`);
  else if (parsed.minM2 !== null) chips.push(`${parsed.minM2}+ m²`);
  else if (parsed.maxM2 !== null) chips.push(`en çok ${parsed.maxM2} m²`);
  for (const t of parsed.text) chips.push(`“${t}”`);
  if (chips.length === 0) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
      Anladığım:
      {chips.map((c) => (
        <span key={c} className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-semibold text-ink">
          {c}
        </span>
      ))}
    </p>
  );
}

const selectCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-ink focus:outline-none disabled:bg-paper";
const inputCls =
  "h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm focus:border-ink focus:outline-none";

function Filters({
  get,
  setParams,
}: {
  get: (k: Key) => string;
  setParams: (p: Partial<Record<Key, string>>) => void;
}) {
  const cityCode = get("cityCode");
  const cities = useQuery({
    queryKey: ["loc", "cities"],
    queryFn: () => api<City[]>("/locations/cities"),
    staleTime: Infinity,
  });
  const districts = useQuery({
    queryKey: ["loc", "districts", cityCode],
    queryFn: async () => sortTr(await api<NamedId[]>(`/locations/cities/${cityCode}/districts`)),
    enabled: !!cityCode,
    staleTime: Infinity,
  });
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
      active ? "border-ink bg-ink text-white" : "border-line text-ink-soft hover:text-ink"
    }`;

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-surface p-5">
      <Group label="İlan tipi">
        <div className="flex flex-wrap gap-1.5">
          {([["", "Tümü"], ["sale", "Satılık"], ["rent", "Kiralık"]] as const).map(([v, l]) => (
            <button key={v} type="button" className={pill(get("dealType") === v)} onClick={() => setParams({ dealType: v })}>
              {l}
            </button>
          ))}
        </div>
      </Group>
      <Group label="Konum">
        <div className="space-y-2">
          <select
            aria-label="İl"
            className={selectCls}
            value={cityCode}
            onChange={(e) => setParams({ cityCode: e.target.value, districtId: "" })}
          >
            <option value="">Tümü</option>
            {cities.data?.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="İlçe"
            className={selectCls}
            disabled={!cityCode}
            value={get("districtId")}
            onChange={(e) => setParams({ districtId: e.target.value })}
          >
            <option value="">Tümü</option>
            {districts.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </Group>
      <Group label="Kategori">
        <select
          aria-label="Kategori"
          className={selectCls}
          value={get("category")}
          onChange={(e) => setParams({ category: e.target.value })}
        >
          <option value="">Tümü</option>
          {(Object.keys(CATEGORY_LABEL) as ListingCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Group>
      <Group label="Oda">
        <div className="flex flex-wrap gap-1.5">
          {ROOMS.map((r) => (
            <button
              key={r}
              type="button"
              className={pill(get("rooms") === r)}
              onClick={() => setParams({ rooms: get("rooms") === r ? "" : r })}
            >
              {r}
            </button>
          ))}
        </div>
      </Group>
      <Range key={`p${get("minPrice")}|${get("maxPrice")}`} label="Fiyat (₺)" minKey="minPrice" maxKey="maxPrice" get={get} setParams={setParams} />
      <Range key={`a${get("minM2")}|${get("maxM2")}`} label="Alan (m²)" minKey="minM2" maxKey="maxM2" get={get} setParams={setParams} />
      <button
        type="button"
        className="text-sm font-semibold text-ink-soft hover:text-brand"
        onClick={() =>
          setParams(Object.fromEntries(KEYS.filter((k) => k !== "q").map((k) => [k, ""])) as Partial<Record<Key, string>>)
        }
      >
        Filtreleri temizle
      </button>
    </div>
  );
}

function Range({
  label,
  minKey,
  maxKey,
  get,
  setParams,
}: {
  label: string;
  minKey: Key;
  maxKey: Key;
  get: (k: Key) => string;
  setParams: (p: Partial<Record<Key, string>>) => void;
}) {
  const [min, setMin] = useState(get(minKey));
  const [max, setMax] = useState(get(maxKey));
  const digits = (s: string) => s.replace(/\D/g, "");
  const apply = () => setParams({ [minKey]: digits(min), [maxKey]: digits(max) });
  return (
    <Group label={label}>
      <div className="flex items-center gap-2">
        <input
          aria-label={`${label} en az`}
          inputMode="numeric"
          placeholder="En az"
          className={inputCls}
          value={min}
          onChange={(e) => setMin(digits(e.target.value))}
          onBlur={apply}
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
        <span className="text-ink-soft">–</span>
        <input
          aria-label={`${label} en çok`}
          inputMode="numeric"
          placeholder="En çok"
          className={inputCls}
          value={max}
          onChange={(e) => setMax(digits(e.target.value))}
          onBlur={apply}
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
      </div>
    </Group>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      {children}
    </div>
  );
}
