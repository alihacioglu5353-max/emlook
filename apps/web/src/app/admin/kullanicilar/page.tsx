"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Avatar, BadgeChip, FilterSelect, PAGE_SIZE, Pagination } from "@/components/data-ui";
import { Alert, Button, EmptyState, Spinner, StatusBadge } from "@/components/ui";
import { api, type AdminUserRow, type Role } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/format";

const ROLE: Record<Role, string> = { agent: "Danışman", consumer: "Mülk sahibi", admin: "Yönetici" };
const PAGE = PAGE_SIZE;

export default function AdminUsers() {
  return (
    <Suspense fallback={<Spinner />}>
      <WithQuery />
    </Suspense>
  );
}

/** Üst bardaki aramadan ?q= ile gelinebilir; arama değişince liste baştan kurulur */
function WithQuery() {
  const q = useSearchParams().get("q") ?? "";
  return <Users key={q} initial={q} />;
}

function Users({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [q, setQ] = useState(initial);
  const [role, setRole] = useState<Role | "">("");
  const [status, setStatus] = useState<"" | "active" | "suspended">("");
  const [offset, setOffset] = useState(0);
  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (q) params.set("q", q);
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  const list = useQuery({
    queryKey: ["admin-users", params.toString()],
    queryFn: () => api<{ items: AdminUserRow[]; total: number }>(`/admin/users?${params}`),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setOffset(0);
    setQ(text.trim());
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <input
          type="search"
          aria-label="Ad veya telefon"
          placeholder="Ad veya telefon"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-10 min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-4 text-sm focus:border-ink focus:outline-none"
        />
        <FilterSelect<Role>
          label="Rol"
          value={role}
          options={[["agent", "Danışman"], ["consumer", "Mülk sahibi"], ["admin", "Yönetici"]]}
          onChange={(v) => { setRole(v); setOffset(0); }}
        />
        <FilterSelect<"active" | "suspended">
          label="Durum"
          value={status}
          options={[["active", "Etkin"], ["suspended", "Askıda"]]}
          onChange={(v) => { setStatus(v); setOffset(0); }}
        />
        <Button type="submit" variant="secondary" className="!h-10">
          Ara
        </Button>
      </form>

      {list.isError ? (
        <Alert tone="error">{list.error.message}</Alert>
      ) : !list.data ? (
        <Spinner />
      ) : list.data.items.length === 0 ? (
        <EmptyState>Kullanıcı bulunamadı.</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-3">Kullanıcı</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Ofis</th>
                  <th className="px-4 py-3 text-right">Yayında</th>
                  <th className="px-4 py-3">Rozet</th>
                  <th className="px-4 py-3">Son görülme</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar avatar={u.avatar} name={u.fullName} size={32} />
                        <div>
                          <Link href={`/admin/kullanicilar/${u.id}`} className="font-semibold hover:underline">
                            {u.fullName ?? "—"}
                          </Link>
                          <p className="text-xs text-ink-soft">{formatPhone(u.phone)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.role ? ROLE[u.role] : "Kayıt yarım"}
                      {u.verification && u.role === "agent" && (
                        <span className="ml-2 align-middle">
                          <StatusBadge status={u.verification} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{u.officeName ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.activeListings}</td>
                    <td className="px-4 py-3">{u.badge ? <BadgeChip badge={u.badge} score={u.score ?? undefined} size="xs" /> : <span className="text-ink-soft">—</span>}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {u.lastSeenAt ? (
                        <span className="inline-flex items-center gap-1.5">
                          {u.online && <span className="h-2 w-2 rounded-full bg-ok" title="Çevrimiçi" />}
                          {timeAgo(u.lastSeenAt)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.status === "suspended" ? (
                        <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[11px] font-bold text-brand-ink">Askıda</span>
                      ) : (
                        <span className="text-ok">Etkin</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={list.data.total} offset={offset} pageSize={PAGE} onChange={setOffset} />
        </>
      )}
    </div>
  );
}
