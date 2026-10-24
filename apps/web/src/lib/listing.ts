import type { DealType, EidsStatus, ListingCategory, ListingStatus, ListingVisibility } from "./api";

export const DEAL_LABEL: Record<DealType, string> = { sale: "Satılık", rent: "Kiralık" };

export const CATEGORY_LABEL: Record<ListingCategory, string> = {
  apartment: "Daire",
  residence: "Rezidans",
  villa: "Villa",
  detached_house: "Müstakil ev",
  land: "Arsa",
  shop: "Dükkan",
  office: "Ofis / büro",
  warehouse: "Depo",
  building: "Bina",
  other: "Diğer",
};

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Taslak",
  active: "Yayında",
  passive: "Pasif",
  sold: "Satıldı / kiralandı",
  removed: "Kaldırıldı",
};

export const VISIBILITY_LABEL: Record<ListingVisibility, { label: string; hint: string }> = {
  public: { label: "Herkes", hint: "Danışmanlar ve mülk sahipleri görür" },
  agents: { label: "Yalnızca danışmanlar", hint: "Mülk sahipleri göremez" },
  network: { label: "Ağım", hint: "Seni takip eden danışmanlar ve ofis arkadaşların" },
};

export const EIDS_LABEL: Record<EidsStatus, string> = {
  unverified: "Doğrulanmadı",
  pending: "İnceleniyor",
  verified: "EİDS onaylı",
  failed: "Doğrulanamadı",
};

const priceFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

export const formatPrice = (n: number, deal?: DealType) =>
  `${priceFmt.format(n)} ₺${deal === "rent" ? " / ay" : ""}`;

/** "Kadıköy, İstanbul" veya mahalleyle birlikte */
export const formatLocation = (
  l: { city: string; district: string; neighbourhood: string | null },
  withNeighbourhood = true,
) => [withNeighbourhood ? l.neighbourhood : null, l.district, l.city].filter(Boolean).join(", ");

export const sortTr = <T extends { name: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name, "tr"));

const moneyFmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kuruş → "1.234,50 ₺" */
export const formatKurus = (kurus: number) => `${moneyFmt.format(kurus / 100)} ₺`;

/** "1.234,50" / "1234.5" / "1.234" → kuruş; geçersizse null */
export function parseTl(input: string): number | null {
  const s = input.trim().replace(/\s|₺/g, "");
  if (!s) return null;
  // Son virgül ondalık ayırıcı; noktalar binlik
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export const PAYMENT_STATUS_LABEL: Record<"open" | "paid" | "cancelled" | "expired" | "refunded", string> = {
  open: "Ödeme bekliyor",
  paid: "Ödendi",
  cancelled: "İptal edildi",
  expired: "Süresi doldu",
  refunded: "İade edildi",
};
