import Link from "next/link";
import type { ReactNode } from "react";
import { fileUrl, type ListingCard as Card, type ListingStatus } from "@/lib/api";
import {
  CATEGORY_LABEL,
  DEAL_LABEL,
  formatLocation,
  formatPrice,
  LISTING_STATUS_LABEL,
} from "@/lib/listing";
import { VerifiedIcon } from "./ui";

/** Fotoğraf yoksa gösterilen sade yer tutucu */
export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-paper text-ink-soft/50 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-10 w-10" aria-hidden>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"
        />
      </svg>
    </div>
  );
}

export function EidsBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[11px] font-bold text-ok ${className}`}
      title="Yetki EİDS üzerinden doğrulandı"
    >
      <VerifiedIcon className="h-3 w-3" />
      EİDS
    </span>
  );
}

/** Akış, arama ve portföy listelerinde ortak ilan kartı */
export function ListingCard({
  item,
  href,
  topRight,
  footer,
}: {
  item: Card;
  href: string;
  topRight?: ReactNode;
  footer?: ReactNode;
}) {
  const specs = [
    item.rooms,
    item.netM2 ? `${item.netM2} m² net` : item.grossM2 ? `${item.grossM2} m²` : null,
    CATEGORY_LABEL[item.category],
  ].filter(Boolean);

  return (
    <article className="group overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-ink-soft/40">
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-paper">
          {item.coverPhoto ? (
            // Fotoğraflar oturum çerezli köprüden gelir; Next görüntü optimizasyonu kullanılamaz.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileUrl(item.coverPhoto)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <PhotoPlaceholder className="h-full w-full" />
          )}
          <div className="absolute left-3 top-3 flex gap-1.5">
            <span className="rounded-full bg-ink/85 px-2.5 py-0.5 text-[11px] font-bold text-white">
              {DEAL_LABEL[item.dealType]}
            </span>
            {item.isDemo && (
              <span className="rounded-full bg-warn-tint px-2.5 py-0.5 text-[11px] font-bold text-warn">
                Deneme
              </span>
            )}
          </div>
          {topRight && <div className="absolute right-3 top-3">{topRight}</div>}
          {item.photoCount > 1 && (
            <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">
              {item.photoCount} foto
            </span>
          )}
        </div>
        <div className="space-y-1.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg font-extrabold tracking-tight">
              {formatPrice(item.price, item.dealType)}
            </p>
            {item.eidsVerified && <EidsBadge />}
          </div>
          <h3 className="line-clamp-1 font-semibold">{item.title}</h3>
          <p className="text-sm text-ink-soft">{specs.join(" · ")}</p>
          <p className="line-clamp-1 text-sm text-ink-soft">{formatLocation(item.location)}</p>
          {item.cobrokeShare !== null && item.cobrokeShare > 0 && (
            <p className="text-xs font-semibold text-brand">
              Paylaşım: alıcı danışmana %{item.cobrokeShare}
            </p>
          )}
        </div>
      </Link>
      {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
    </article>
  );
}

export function OwnerLine({ owner }: { owner: Card["owner"] }) {
  return (
    <p className="flex items-center gap-1.5 text-sm">
      <span className="font-semibold">{owner.fullName ?? "Danışman"}</span>
      {owner.isVerified && <VerifiedIcon className="h-3.5 w-3.5 text-[#2f7de1]" />}
      <span className="text-ink-soft">· {owner.officeName ?? "Bağımsız"}</span>
    </p>
  );
}

const STATUS_TONE: Record<ListingStatus, string> = {
  draft: "bg-paper text-ink-soft border border-line",
  active: "bg-ok-tint text-ok",
  passive: "bg-warn-tint text-warn",
  sold: "bg-ink text-white",
  removed: "bg-brand-tint text-brand-ink",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[status]}`}>
      {LISTING_STATUS_LABEL[status]}
    </span>
  );
}

