import type { DealType, ListingCategory } from '../db/schema.js';

/**
 * Serbest metin aramasını yapılandırılmış filtrelere çevirir.
 * "kadıköy satılık 3+1 daire 10 milyon altı" →
 *   { district: Kadıköy, dealType: sale, rooms: '3+1', category: apartment, maxPrice: 10_000_000 }
 * Tanınmayan kelimeler `text` olarak kalır ve ilan arama metninde aranır.
 */

export interface LocationIndex {
  cities: { code: string; name: string; norm: string }[];
  districts: { id: number; cityCode: string; name: string; norm: string }[];
}

export interface ParsedQuery {
  dealType?: DealType;
  category?: ListingCategory;
  rooms?: string;
  minPrice?: number;
  maxPrice?: number;
  minM2?: number;
  maxM2?: number;
  city?: { code: string; name: string };
  district?: { id: number; name: string; cityCode: string };
  text: string[];
}

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c);

const DEAL: Record<string, DealType> = {
  satilik: 'sale',
  satlik: 'sale',
  satis: 'sale',
  kiralik: 'rent',
  kira: 'rent',
  kiralk: 'rent',
};

/** Çok kelimeliler önce denenir */
const CATEGORY: [string, ListingCategory][] = [
  ['mustakil ev', 'detached_house'],
  ['is yeri', 'shop'],
  ['mustakil', 'detached_house'],
  ['mustakil evi', 'detached_house'],
  ['isyeri', 'shop'],
  ['dukkan', 'shop'],
  ['magaza', 'shop'],
  ['daire', 'apartment'],
  ['daireler', 'apartment'],
  ['rezidans', 'residence'],
  ['villa', 'villa'],
  ['arsa', 'land'],
  ['tarla', 'land'],
  ['arazi', 'land'],
  ['ofis', 'office'],
  ['buro', 'office'],
  ['depo', 'warehouse'],
  ['bina', 'building'],
];

const STOP = new Set([
  'ev', 'evi', 'ilan', 'ilani', 'ilanlar', 'ilanlari', 'icin', 've', 'ile', 'da', 'de', 'ta', 'te',
  'bir', 'en', 'cok', 'olan', 'tl', 'lira', 'oda', 'odali', 'fiyat', 'fiyatli',
]);

const UNIT: Record<string, number> = { milyon: 1_000_000, mn: 1_000_000, m: 1_000_000, bin: 1_000, k: 1_000 };
const num = (s: string) => Number(s.replace(',', '.'));

const MAX_WORDS = '(?:alti|altinda|asagi|asagisi|max|maks|maksimum|en fazla|e kadar|a kadar|ye kadar|ya kadar|kadar)';
const MIN_WORDS = '(?:ustu|uzeri|ustunde|yukari|yukarisi|min|minimum|en az|den fazla|dan fazla|ten fazla|tan fazla)';

export function parseQuery(input: string, idx: LocationIndex): ParsedQuery {
  const out: ParsedQuery = { text: [] };
  // Binlik ayırıcıları birleştir: 10.000.000 → 10000000 ; ondalık virgülü koru (2,5 milyon)
  let s = ` ${fold(input).replace(/(\d)[.](?=\d{3}\b)/g, '$1')} `;
  const cut = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(s);
    if (!m) return false;
    fn(m);
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return true;
  };

  // Fiyat aralığı: "3-5 milyon", "20 ile 30 bin"
  cut(/\s(\d+(?:[.,]\d+)?)\s*(?:-|ile)\s*(\d+(?:[.,]\d+)?)\s*(milyon|mn|m|bin|k)\b(?:\s*(?:tl|lira))?/, (m) => {
    const u = UNIT[m[3]]!;
    out.minPrice = Math.round(num(m[1]!) * u);
    out.maxPrice = Math.round(num(m[2]!) * u);
  });

  // Alan: "120 m2", "100 metrekare üstü"
  cut(new RegExp(`\\s(\\d{2,6})\\s*(?:m2|m²|mt2|metrekare|metre kare)\\b\\s*(${MAX_WORDS}|${MIN_WORDS})?`), (m) => {
    const v = Number(m[1]);
    const q = m[2];
    if (q && new RegExp(`^${MAX_WORDS}$`).test(q)) out.maxM2 = v;
    else if (q) out.minM2 = v;
    else {
      out.minM2 = Math.round(v * 0.85);
      out.maxM2 = Math.round(v * 1.15);
    }
  });

  // Tek fiyat: "10 milyon altı", "25 bin tl", "15000 tl üstü"
  if (out.minPrice === undefined && out.maxPrice === undefined) {
    cut(
      new RegExp(`\\s(\\d+(?:[.,]\\d+)?)\\s*(milyon|mn|bin|k|tl|lira)\\b(?:\\s*(?:tl|lira))?\\s*(${MAX_WORDS}|${MIN_WORDS})?`),
      (m) => {
        const unit = m[2] === 'tl' || m[2] === 'lira' ? 1 : UNIT[m[2]!]!;
        const v = Math.round(num(m[1]!) * unit);
        // Niteleyici yoksa bütçe kabul edilir: en fazla
        if (m[3] && new RegExp(`^${MIN_WORDS}$`).test(m[3])) out.minPrice = v;
        else out.maxPrice = v;
      },
    );
  }

  // Oda: "3+1", "3 + 1", "stüdyo", "1+0"
  cut(/\s(\d{1,2})\s*\+\s*(\d{1,2})\s/, (m) => {
    out.rooms = m[2] === '0' && m[1] === '1' ? 'Stüdyo' : `${m[1]}+${m[2]}`;
  });
  cut(/\s(?:studyo|stüdyo)\s/, () => {
    out.rooms = 'Stüdyo';
  });

  // Kalan metni sadeleştir
  let rest = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Kategori (çok kelimeli önce)
  for (const [word, cat] of [...CATEGORY].sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`(^|\\s)${word}(\\s|$)`);
    if (re.test(rest)) {
      out.category ??= cat;
      rest = rest.replace(re, ' ').trim();
    }
  }

  // Konum: önce il, sonra ilçe (çok kelimeli adlar önce)
  const words = () => ` ${rest} `;
  for (const c of [...idx.cities].sort((a, b) => b.norm.length - a.norm.length)) {
    if (words().includes(` ${c.norm} `)) {
      out.city = { code: c.code, name: c.name };
      rest = words().replace(` ${c.norm} `, ' ').trim();
      break;
    }
  }
  const districtCandidates = [...idx.districts].sort((a, b) => b.norm.length - a.norm.length);
  for (const d of districtCandidates) {
    if (!words().includes(` ${d.norm} `)) continue;
    const same = idx.districts.filter((x) => x.norm === d.norm);
    const pick = out.city ? same.find((x) => x.cityCode === out.city!.code) : same.length === 1 ? same[0] : undefined;
    if (!pick) continue; // belirsiz ilçe adı (ör. "Merkez") il olmadan serbest metin kalır
    out.district = { id: pick.id, name: pick.name, cityCode: pick.cityCode };
    if (!out.city) {
      const c = idx.cities.find((x) => x.code === pick.cityCode);
      if (c) out.city = { code: c.code, name: c.name };
    }
    rest = words().replace(` ${d.norm} `, ' ').trim();
    break;
  }

  for (const w of rest.split(' ')) {
    if (!w) continue;
    if (DEAL[w]) {
      out.dealType ??= DEAL[w];
      continue;
    }
    if (STOP.has(w) || w.length < 2) continue;
    out.text.push(w);
  }
  return out;
}
