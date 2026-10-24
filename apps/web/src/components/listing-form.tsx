"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  api,
  type City,
  type DealType,
  type ListingCategory,
  type ListingDetail,
  type ListingInput,
  type ListingVisibility,
  type NamedId,
} from "@/lib/api";
import { CATEGORY_LABEL, DEAL_LABEL, sortTr, VISIBILITY_LABEL } from "@/lib/listing";
import { Alert, Button, Field, Input, Textarea } from "./ui";

const selectCls =
  "h-12 w-full appearance-none rounded-xl border border-line bg-surface px-4 text-[15px] text-ink focus:border-ink focus:outline-none disabled:bg-paper disabled:text-ink-soft";

/** Konum listeleri nadiren değişir: oturum boyunca önbellekte kalır. */
const forever = { staleTime: Infinity, gcTime: Infinity } as const;

const digits = (s: string) => s.replace(/\D/g, "");
const num = (s: string) => (s.trim() === "" ? null : Number(digits(s)));
const groupThousands = (s: string) => {
  const d = digits(s);
  return d ? new Intl.NumberFormat("tr-TR").format(Number(d)) : "";
};

interface FormState {
  dealType: DealType;
  category: ListingCategory;
  title: string;
  description: string;
  price: string;
  grossM2: string;
  netM2: string;
  rooms: string;
  floor: string;
  buildingAge: string;
  cityCode: string;
  districtId: string;
  neighbourhoodId: string;
  cobrokeShare: string;
  visibility: ListingVisibility;
  isDemo: boolean;
  propertyNumber: string;
}

function initial(l?: ListingDetail): FormState {
  const s = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    dealType: l?.dealType ?? "sale",
    category: l?.category ?? "apartment",
    title: l?.title ?? "",
    description: l?.description ?? "",
    price: l ? groupThousands(String(l.price)) : "",
    grossM2: s(l?.grossM2),
    netM2: s(l?.netM2),
    rooms: l?.rooms ?? "",
    floor: l?.floor ?? "",
    buildingAge: s(l?.buildingAge),
    cityCode: l?.cityCode ?? "",
    districtId: s(l?.districtId),
    neighbourhoodId: s(l?.neighbourhoodId),
    cobrokeShare: s(l?.cobrokeShare ?? 50),
    visibility: l?.visibility ?? "public",
    isDemo: l?.isDemo ?? false,
    propertyNumber: l?.eids.propertyNumber ?? "",
  };
}

const ROOM_PRESETS = ["Stüdyo", "1+1", "2+1", "3+1", "4+1", "5+1"];
const NO_ROOMS: ListingCategory[] = ["land", "shop", "warehouse", "building", "office"];

export function ListingForm({
  listing,
  submitLabel,
  onSubmit,
}: {
  listing?: ListingDetail;
  submitLabel: string;
  onSubmit: (input: ListingInput) => Promise<unknown>;
}) {
  const [f, setF] = useState<FormState>(() => initial(listing));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const citiesQ = useQuery({
    queryKey: ["loc", "cities"],
    queryFn: () => api<City[]>("/locations/cities"),
    ...forever,
  });
  const districtsQ = useQuery({
    queryKey: ["loc", "districts", f.cityCode],
    queryFn: async () => sortTr(await api<NamedId[]>(`/locations/cities/${f.cityCode}/districts`)),
    enabled: !!f.cityCode,
    ...forever,
  });
  const neighQ = useQuery({
    queryKey: ["loc", "neigh", f.districtId],
    queryFn: async () =>
      sortTr(await api<NamedId[]>(`/locations/districts/${f.districtId}/neighbourhoods`)),
    enabled: !!f.districtId,
    ...forever,
  });

  const eidsLocked = listing?.eids.verified ?? false;
  const showRooms = !NO_ROOMS.includes(f.category);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const price = num(f.price);
    if (!price) return setError("Fiyat girin");
    if (!f.cityCode || !f.districtId) return setError("İl ve ilçe seçin");
    const share = Number(f.cobrokeShare);
    if (!Number.isInteger(share) || share < 0 || share > 100) {
      return setError("Paylaşım oranı 0 ile 100 arasında olmalı");
    }
    const input: ListingInput = {
      dealType: f.dealType,
      category: f.category,
      title: f.title.trim(),
      description: f.description.trim() || null,
      price,
      grossM2: num(f.grossM2),
      netM2: num(f.netM2),
      rooms: showRooms ? f.rooms.trim() || null : null,
      floor: f.floor.trim() || null,
      buildingAge: num(f.buildingAge),
      cityCode: f.cityCode,
      districtId: Number(f.districtId),
      neighbourhoodId: f.neighbourhoodId ? Number(f.neighbourhoodId) : null,
      cobrokeShare: share,
      visibility: f.visibility,
      isDemo: f.isDemo,
    };
    if (!eidsLocked && f.propertyNumber.trim()) input.propertyNumber = digits(f.propertyNumber);
    setSaving(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="Temel bilgiler">
        <div>
          <span className="mb-1.5 block text-sm font-semibold">İlan tipi</span>
          <div className="inline-flex rounded-full border border-line bg-paper p-1">
            {(Object.keys(DEAL_LABEL) as DealType[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={f.dealType === d}
                onClick={() => set("dealType", d)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  f.dealType === d ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                {DEAL_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kategori">
            <select
              className={selectCls}
              value={f.category}
              onChange={(e) => set("category", e.target.value as ListingCategory)}
            >
              {(Object.keys(CATEGORY_LABEL) as ListingCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={f.dealType === "rent" ? "Aylık kira (₺)" : "Fiyat (₺)"}>
            <Input
              inputMode="numeric"
              required
              value={f.price}
              placeholder="12.500.000"
              onChange={(e) => set("price", groupThousands(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Başlık" hint="5–120 karakter. Örn: Moda sahile yürüme mesafesinde 3+1">
          <Input
            required
            minLength={5}
            maxLength={120}
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="Açıklama">
          <Textarea
            rows={5}
            maxLength={5000}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Özellikler">
        {showRooms && (
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Oda sayısı</span>
            <div className="flex flex-wrap items-center gap-2">
              {ROOM_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={f.rooms === r}
                  onClick={() => set("rooms", f.rooms === r ? "" : r)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                    f.rooms === r ? "border-ink bg-ink text-white" : "border-line text-ink-soft hover:text-ink"
                  }`}
                >
                  {r}
                </button>
              ))}
              <Input
                aria-label="Diğer oda sayısı"
                placeholder="Diğer: 6+2"
                className="!h-9 w-32 !text-sm"
                value={ROOM_PRESETS.includes(f.rooms) ? "" : f.rooms}
                onChange={(e) => set("rooms", e.target.value.replace(/\s/g, ""))}
              />
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Brüt m²">
            <Input inputMode="numeric" value={f.grossM2} onChange={(e) => set("grossM2", digits(e.target.value))} />
          </Field>
          <Field label="Net m²">
            <Input inputMode="numeric" value={f.netM2} onChange={(e) => set("netM2", digits(e.target.value))} />
          </Field>
          <Field label="Kat">
            <Input
              maxLength={20}
              placeholder="4, Bahçe, Çatı"
              value={f.floor}
              onChange={(e) => set("floor", e.target.value)}
            />
          </Field>
          <Field label="Bina yaşı">
            <Input
              inputMode="numeric"
              value={f.buildingAge}
              onChange={(e) => set("buildingAge", digits(e.target.value).slice(0, 3))}
            />
          </Field>
        </div>
      </Section>

      <Section title="Konum">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="İl">
            <select
              className={selectCls}
              required
              value={f.cityCode}
              onChange={(e) => setF((p) => ({ ...p, cityCode: e.target.value, districtId: "", neighbourhoodId: "" }))}
            >
              <option value="">Seçin</option>
              {citiesQ.data?.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="İlçe">
            <select
              className={selectCls}
              required
              disabled={!f.cityCode || !districtsQ.data}
              value={f.districtId}
              onChange={(e) => setF((p) => ({ ...p, districtId: e.target.value, neighbourhoodId: "" }))}
            >
              <option value="">Seçin</option>
              {districtsQ.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mahalle / köy">
            <select
              className={selectCls}
              disabled={!f.districtId || !neighQ.data}
              value={f.neighbourhoodId}
              onChange={(e) => set("neighbourhoodId", e.target.value)}
            >
              <option value="">Seçin (isteğe bağlı)</option>
              {neighQ.data?.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {citiesQ.isError && <Alert tone="error">Konum listesi yüklenemedi.</Alert>}
      </Section>

      <Section title="Paylaşım ve görünürlük">
        <Field
          label="Alıcı danışmanın komisyon payı (%)"
          hint="İşlemi alıcı tarafından getiren danışmana ödenecek pay. Mülk sahipleri bu bilgiyi görmez."
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={f.cobrokeShare || 0}
              onChange={(e) => set("cobrokeShare", e.target.value)}
              className="flex-1 accent-[var(--brand)]"
            />
            <Input
              inputMode="numeric"
              className="!w-20 text-center"
              value={f.cobrokeShare}
              onChange={(e) => set("cobrokeShare", digits(e.target.value).slice(0, 3))}
            />
          </div>
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Kimler görebilir?</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(VISIBILITY_LABEL) as ListingVisibility[]).map((v) => (
              <label
                key={v}
                className={`cursor-pointer rounded-xl border p-3.5 transition ${
                  f.visibility === v ? "border-ink bg-paper" : "border-line hover:border-ink-soft/40"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  className="sr-only"
                  checked={f.visibility === v}
                  onChange={() => set("visibility", v)}
                />
                <span className="block text-sm font-semibold">{VISIBILITY_LABEL[v].label}</span>
                <span className="block text-xs text-ink-soft">{VISIBILITY_LABEL[v].hint}</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="EİDS yetki doğrulaması">
        <Field
          label="Taşınmaz numarası"
          hint={
            eidsLocked
              ? "EİDS ile doğrulandı; numara değiştirilemez."
              : "Tapudaki taşınmaz numarası. Kaydettikten sonra ilan sayfasından doğrulayabilirsin."
          }
        >
          <Input
            inputMode="numeric"
            maxLength={20}
            disabled={eidsLocked}
            value={f.propertyNumber}
            onChange={(e) => set("propertyNumber", digits(e.target.value))}
          />
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3.5">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--brand)]"
            checked={f.isDemo}
            onChange={(e) => set("isDemo", e.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold">Deneme ilanı</span>
            <span className="block text-xs text-ink-soft">
              EİDS onayı olmadan yayınlanır ve &quot;Deneme&quot; etiketiyle görünür. Lansman
              öncesi test içindir.
            </span>
          </span>
        </label>
      </Section>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </fieldset>
  );
}
