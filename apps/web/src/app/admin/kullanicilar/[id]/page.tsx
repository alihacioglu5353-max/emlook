"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ReasonAction } from "@/components/admin";
import { Alert, Button, Eyebrow, Spinner, StatusBadge } from "@/components/ui";
import { api, type AdminUserDetail } from "@/lib/api";
import { formatDate, formatPhone } from "@/lib/format";
import { useAction } from "@/lib/use-action";

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ["admin-user", id];
  const q = useQuery({ queryKey: key, queryFn: () => api<AdminUserDetail>(`/admin/users/${id}`) });
  const action = useAction();
  const u = q.data;
  if (!u) return q.isError ? <Alert tone="error">{q.error.message}</Alert> : <Spinner />;

  const apply = (next: AdminUserDetail) => {
    qc.setQueryData(key, next);
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const stats: [string, number][] = [
    ["Yayındaki ilan", u.stats.activeListings],
    ["Toplam ilan", u.stats.allListings],
    ["Takipçi", u.stats.followers],
    ["Hakkındaki şikâyet", u.stats.reportsAgainst],
    ["Ödenen tahsilat", u.stats.paidPayments],
    ["Açık oturum", u.stats.activeSessions],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/kullanicilar" className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← Kullanıcılar
        </Link>
        <Eyebrow>{u.role === "agent" ? "Danışman" : u.role === "consumer" ? "Mülk sahibi" : u.role === "admin" ? "Yönetici" : "Kayıt yarım"}</Eyebrow>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight">
          {u.fullName ?? "—"}
          {u.verification && <StatusBadge status={u.verification} />}
        </h1>
        <p className="mt-1 text-ink-soft">
          {formatPhone(u.phone)}
          {u.email && ` · ${u.email}`} · Kayıt {formatDate(u.createdAt)}
        </p>
        {u.role === "agent" && (
          <p className="mt-1 text-sm text-ink-soft">
            Yetki belgesi {u.licenseNumber ?? "—"} · {u.businessName ?? "—"} ·{" "}
            <Link href={`/admin/basvurular/${u.id}`} className="font-semibold text-brand hover:underline">
              Başvuru
            </Link>{" "}
            ·{" "}
            <Link href={`/danisman/${u.id}`} className="font-semibold text-brand hover:underline">
              Profil
            </Link>
          </p>
        )}
      </div>

      {action.error && <Alert tone="error">{action.error}</Alert>}

      {u.status === "suspended" ? (
        <Alert tone="error" title={`Askıda · ${u.suspendedAt ? formatDate(u.suspendedAt) : ""}`}>
          <p>{u.suspendedReason}</p>
          <Button
            className="mt-3 !h-9"
            variant="secondary"
            loading={action.busy === "reactivate"}
            onClick={() => action.run("reactivate", async () => apply(await api<AdminUserDetail>(`/admin/users/${id}/reactivate`, { method: "POST" })))}
          >
            Yeniden etkinleştir
          </Button>
        </Alert>
      ) : (
        u.role !== "admin" && (
          <ReasonAction
            label="Hesabı askıya al"
            placeholder="Gerekçe (kullanıcı kayıtlarında saklanır)"
            confirmLabel="Askıya al"
            busy={action.busy === "suspend"}
            onSubmit={(reason) =>
              action.run("suspend", async () =>
                apply(await api<AdminUserDetail>(`/admin/users/${id}/suspend`, { json: { reason } })),
              )
            }
          />
        )
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-2xl font-extrabold tabular-nums">{v}</p>
            <p className="text-xs font-semibold text-ink-soft">{k}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
