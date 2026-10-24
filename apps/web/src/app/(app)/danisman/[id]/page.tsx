"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/components/app-shell";
import { ListingGrid } from "@/components/listing-grid";
import { Avatar, FollowButton, PersonRow } from "@/components/social";
import { Alert, Button, EmptyState, RoleBadge, Spinner, VerifiedIcon } from "@/components/ui";
import { api, type AgentProfileCard, type Page, type PersonCard } from "@/lib/api";

type Tab = "listings" | "followers" | "following";

export default function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("listings");
  const key = ["agent", id];
  const card = useQuery({ queryKey: key, queryFn: () => api<AgentProfileCard>(`/agents/${id}`) });

  const a = card.data;
  if (!a) {
    return card.isError ? (
      <Alert tone="error" title="Profil görüntülenemiyor">
        {card.error.message}
      </Alert>
    ) : (
      <Spinner />
    );
  }
  const isMe = me.id === a.id;
  const place = [a.district, a.city].filter(Boolean).join(", ");

  const tabs: [Tab, string, number][] = [
    ["listings", "İlanlar", a.activeListingCount],
    ["followers", "Takipçi", a.followerCount],
    ["following", "Takip", a.followingCount],
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={a.fullName} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              {a.fullName ?? "Danışman"}
              {a.isVerified && <VerifiedIcon className="h-5 w-5 text-[#2f7de1]" aria-label="Onaylı danışman" />}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-soft">
              {a.office ? (
                <>
                  {a.office.name} <RoleBadge role={a.office.role} />
                </>
              ) : (
                "Bağımsız danışman"
              )}
              {place && <span>· {place}</span>}
            </p>
            {a.businessName && <p className="mt-1 text-sm text-ink-soft">{a.businessName}</p>}
            {a.bio && <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px]">{a.bio}</p>}
          </div>
          {!isMe && (
            <FollowButton
              agentId={a.id}
              initial={a.followedByMe}
              onChange={(s) =>
                qc.setQueryData<AgentProfileCard>(key, (prev) =>
                  prev && { ...prev, followerCount: s.followerCount, followedByMe: s.followedByMe },
                )
              }
            />
          )}
        </div>
        <div className="mt-6 flex gap-1 border-t border-line pt-4" role="tablist">
          {tabs.map(([t, label, n]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === t ? "bg-ink text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              <span className="tabular-nums">{n}</span> {label}
            </button>
          ))}
        </div>
      </section>

      {tab === "listings" ? (
        <ListingGrid
          wide
          queryKey={["agent-listings", id]}
          path={`/agents/${id}/listings?limit=18`}
          showOwner={false}
          empty="Yayında ilanı yok."
        />
      ) : (
        <People userId={id} kind={tab} />
      )}
    </div>
  );
}

function People({ userId, kind }: { userId: string; kind: "followers" | "following" }) {
  const q = useInfiniteQuery({
    queryKey: ["people", userId, kind],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<Page<PersonCard>>(
        `/users/${userId}/${kind}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
  const { me } = useMe();
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return <EmptyState>{kind === "followers" ? "Henüz takipçisi yok." : "Henüz kimseyi takip etmiyor."}</EmptyState>;
  }
  return (
    <section className="max-w-xl rounded-2xl border border-line bg-surface px-5">
      <ul className="divide-y divide-line">
        {items.map((p) => (
          <PersonRow key={p.id} person={p} canFollow={p.id !== me.id} />
        ))}
      </ul>
      {q.hasNextPage && (
        <div className="py-3">
          <Button variant="ghost" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Daha fazla
          </Button>
        </div>
      )}
    </section>
  );
}
