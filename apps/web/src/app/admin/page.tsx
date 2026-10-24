"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Card, Eyebrow, Spinner, StatusBadge } from "@/components/ui";
import { api, type AdminListItem, type VerificationStatus } from "@/lib/api";
import { STATUS_LABEL, formatDate, formatPhone } from "@/lib/format";

const TABS: VerificationStatus[] = ["pending", "rejected", "approved", "draft"];

interface ListResponse {
  items: AdminListItem[];
  total: number;
}

export default function AdminVerifications() {
  const [status, setStatus] = useState<VerificationStatus>("pending");
  const counts = useQuery({
    queryKey: ["admin-counts"],
    queryFn: () => api<Record<VerificationStatus, number>>("/admin/verifications/counts"),
  }).data;
  const listQuery = useQuery({
    queryKey: ["admin-verifications", status],
    queryFn: () => api<ListResponse>(`/admin/verifications?status=${status}&limit=50`),
  });
  const list = listQuery.data;
  const error = listQuery.isError ? listQuery.error.message : null;

  return (
    <div>
      <Eyebrow>Yönetim</Eyebrow>
      <h1 className="text-3xl font-extrabold tracking-tight">Danışman başvuruları</h1>
      <p className="mt-2 text-ink-soft">
        Yetki belgesini kontrol et, uygun başvuruları onayla. Bekleyenler en eskiden başlar.
      </p>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={status === t}
            onClick={() => setStatus(t)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              status === t
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-ink-soft hover:text-ink"
            }`}
          >
            {STATUS_LABEL[t]}
            {counts && (
              <span
                className={`rounded-full px-2 text-xs ${
                  status === t ? "bg-white/20" : "bg-paper"
                } ${t === "pending" && counts.pending > 0 && status !== t ? "text-brand" : ""}`}
              >
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card className="mt-6 !p-0 overflow-hidden">
        {error ? (
          <div className="p-6">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : !list ? (
          <div className="px-6">
            <Spinner />
          </div>
        ) : list.items.length === 0 ? (
          <p className="p-10 text-center text-ink-soft">
            {status === "pending" ? "Bekleyen başvuru yok." : "Bu durumda başvuru yok."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-6 py-3 font-semibold">Danışman</th>
                  <th className="px-6 py-3 font-semibold">İşletme / belge no</th>
                  <th className="px-6 py-3 font-semibold">Bölge</th>
                  <th className="px-6 py-3 font-semibold">
                    {status === "pending" ? "Gönderim" : "Son işlem"}
                  </th>
                  <th className="px-6 py-3 font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.items.map((r) => (
                  <tr key={r.userId} className="hover:bg-paper/60">
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/basvurular/${r.userId}`}
                        className="font-semibold hover:text-brand"
                      >
                        {r.fullName ?? "—"}
                      </Link>
                      <div className="text-xs text-ink-soft">{formatPhone(r.phone)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{r.businessName ?? "—"}</div>
                      <div className="text-xs text-ink-soft">{r.licenseNumber ?? "—"}</div>
                    </td>
                    <td className="px-6 py-4">
                      {[r.district, r.city].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-6 py-4 text-ink-soft">
                      {formatDate(status === "pending" ? r.submittedAt : r.reviewedAt)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {list && list.total > list.items.length && (
        <p className="mt-3 text-sm text-ink-soft">
          {list.total} başvurudan ilk {list.items.length} tanesi gösteriliyor.
        </p>
      )}
    </div>
  );
}
