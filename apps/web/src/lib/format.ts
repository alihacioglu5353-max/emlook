import type { OfficeRole, OfficeStatus, VerificationDoc, VerificationStatus } from "./api";

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  draft: "Taslak",
  pending: "İncelemede",
  approved: "Onaylı",
  rejected: "Reddedildi",
};

export const DOC_LABEL: Record<VerificationDoc["type"], string> = {
  authority_certificate: "Yetki belgesi",
  identity: "Kimlik",
  other: "Diğer",
};

export const MISSING_LABEL: Record<string, string> = {
  licenseNumber: "Yetki belgesi numarası",
  businessName: "İşletme unvanı",
  city: "İl",
  district: "İlçe",
  "document:authority_certificate": "Yetki belgesi dosyası",
};

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");

export function formatPhone(e164: string) {
  const d = e164.replace(/^\+90/, "");
  return d.length === 10
    ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`
    : e164;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const ROLE_LABEL: Record<OfficeRole, string> = {
  owner: "Sahip",
  manager: "Yönetici",
  agent: "Danışman",
};

export const OFFICE_STATUS_LABEL: Record<OfficeStatus, string> = {
  pending: "İncelemede",
  active: "Aktif",
  rejected: "Reddedildi",
  suspended: "Askıda",
};

const relFmt = new Intl.RelativeTimeFormat("tr-TR", { numeric: "auto" });

/** "3 dakika önce", "dün" gibi göreli zaman */
export function timeAgo(iso: string) {
  const sec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return "az önce";
  if (abs < 3600) return relFmt.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return relFmt.format(Math.round(sec / 3600), "hour");
  if (abs < 86400 * 7) return relFmt.format(Math.round(sec / 86400), "day");
  return formatDate(iso);
}
