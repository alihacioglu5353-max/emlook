"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { api, type ListingCard as Card, type Page } from "@/lib/api";
import { ListingCard } from "./listing-card";
import { Reactions, Avatar } from "./social";
import { Alert, Button, EmptyState, Spinner, VerifiedIcon } from "./ui";

/** İmleçli sayfalanan ilan ızgarası (akış, profil, kaydedilenler) */
export function ListingGrid({
  queryKey,
  path,
  empty,
  showOwner = true,
  wide = false,
}: {
  queryKey: QueryKey;
  /** Sorgu dizesi içerebilir; imleç sona eklenir */
  path: string;
  empty: ReactNode;
  showOwner?: boolean;
  /** Yan sütun yoksa geniş ekranda üç sütun */
  wide?: boolean;
}) {
  const q = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sep = path.includes("?") ? "&" : "?";
      return api<Page<Card>>(pageParam ? `${path}${sep}cursor=${encodeURIComponent(pageParam)}` : path);
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;

  return (
    <div className="space-y-6">
      <div className={`grid gap-5 sm:grid-cols-2 ${wide ? "lg:grid-cols-3" : "2xl:grid-cols-3"}`}>
        {items.map((item) => (
          <ListingCard
            key={item.id}
            item={item}
            href={`/ilan/${item.id}`}
            footer={
              <div className="flex items-center justify-between gap-2">
                {showOwner ? <OwnerLink owner={item.owner} /> : <span />}
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
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="ghost" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Daha fazla göster
          </Button>
        </div>
      )}
    </div>
  );
}

function OwnerLink({ owner }: { owner: Card["owner"] }) {
  return (
    <Link href={`/danisman/${owner.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
      <Avatar name={owner.fullName} size={28} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-semibold">
          <span className="truncate">{owner.fullName ?? "Danışman"}</span>
          {owner.isVerified && <VerifiedIcon className="h-3.5 w-3.5 shrink-0 text-[#2f7de1]" />}
        </span>
        <span className="block truncate text-xs text-ink-soft">{owner.officeName ?? "Bağımsız"}</span>
      </span>
    </Link>
  );
}
