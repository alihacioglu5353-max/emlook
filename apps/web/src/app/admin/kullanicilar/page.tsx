"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Pager } from "@/components/admin";
import { Alert, Button, EmptyState, Spinner, StatusBadge } from "@/components/ui";
import { api, type AdminUserRow, type Role } from "@/lib/api";
import { formatPhone, timeAgo } from "@/lib/format";

const ROLE: Record<Role, string> = { agent: "Danışman", consumer: "Mülk sahibi", admin: "Yönetici" };
const PAGE = 30;

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
  const select =
    "h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold focus:border-ink focus:outline-none";

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Ad veya telefon"
          placeholder="Ad veya telefon"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-5 text-sm focus:border-ink focus:outline-none"
        />
        <select aria-label="Rol" className={select} value={role} onChange={(e) => { setRole(e.target.value as Role | ""); setOffset(0); }}>
          <option value="">Tüm roller</option>
          <option value="agent">Danışman</option>
          <option value="consumer">Mülk sahibi</option>
          <option value="admin">Yönetici</option>
        </select>
        <select aria-label="Durum" className={select} value={status} onChange={(e) => { setStatus(e.target.value as "" | "active" | "suspended"); setOffset(0); }}>
          <option value="">Tüm durumlar</option>
          <option value="active">Etkin</option>
          <option value="suspended">Askıda</option>
        </select>
        <Button type="submit" variant="secondary">
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
                  <th className="px-4 py-3">Son giriş</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/kullanicilar/${u.id}`} className="font-semibold hover:underline">
                        {u.fullName ?? "—"}
                      </Link>
                      <p className="text-xs text-ink-soft">{formatPhone(u.phone)}</p>
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
                    <td className="px-4 py-3 text-ink-soft">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "—"}</td>
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
          <Pager total={list.data.total} offset={offset} page={PAGE} onChange={setOffset} />
        </>
      )}
    </div>
  );
}
