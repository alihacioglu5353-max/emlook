"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { FilterTabs, PAGE_SIZE, Pagination, TablePanel, td, th } from "@/components/data-ui";
import { Alert, Spinner, StatusBadge } from "@/components/ui";
import { api, type AdminListItem, type VerificationStatus } from "@/lib/api";
import { STATUS_LABEL, formatDate, formatPhone } from "@/lib/format";

const TABS: [VerificationStatus, string][] = [
  ["pending", STATUS_LABEL.pending],
  ["rejected", STATUS_LABEL.rejected],
  ["approved", STATUS_LABEL.approved],
  ["draft", STATUS_LABEL.draft],
];

export default function AdminVerifications() {
  const [status, setStatus] = useState<VerificationStatus | "">("");
  const [offset, setOffset] = useState(0);
  const counts = useQuery({
    queryKey: ["admin-counts"],
    queryFn: () => api<Record<VerificationStatus, number>>("/admin/verifications/counts"),
  }).data;
  const list = useQuery({
    queryKey: ["admin-verifications", status, offset],
    queryFn: () =>
      api<{ items: AdminListItem[]; total: number }>(`/admin/verifications?status=${status || "all"}&limit=${PAGE_SIZE}&offset=${offset}`),
  });
  const tabCounts = counts && { "": counts.pending + counts.rejected + counts.approved, ...counts };

  return (
    <div className="grid gap-5">
      <p className="text-sm text-ink-soft">Yetki belgesini ve evrakları kontrol et, uygun başvuruları onayla. Bekleyenler en eskiden başlar.</p>
      <FilterTabs
        value={status}
        options={TABS}
        counts={tabCounts}
        onChange={(v) => {
          setStatus(v);
          setOffset(0);
        }}
      />
      <TablePanel footer={list.data && <Pagination total={list.data.total} offset={offset} onChange={setOffset} />}>
        {list.isError ? (
          <div className="p-6">
            <Alert tone="error">{list.error.message}</Alert>
          </div>
        ) : !list.data ? (
          <div className="px-6">
            <Spinner />
          </div>
        ) : list.data.items.length === 0 ? (
          <p className="p-10 text-center text-ink-soft">Bu filtrede başvuru yok.</p>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-line bg-paper">
              <tr>
                <th className={th}>Danışman</th>
                <th className={th}>İşletme / belge no</th>
                <th className={th}>Bölge</th>
                <th className={th}>Gönderim</th>
                <th className={th}>Son işlem</th>
                <th className={th}>Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((r) => (
                <tr key={r.userId} className="hover:bg-paper/60">
                  <td className={td}>
                    <Link href={`/admin/basvurular/${r.userId}`} className="font-semibold hover:text-brand">
                      {r.fullName ?? "—"}
                    </Link>
                    <div className="text-xs text-ink-soft">{formatPhone(r.phone)}</div>
                  </td>
                  <td className={td}>
                    <div>{r.businessName ?? "—"}</div>
                    <div className="text-xs text-ink-soft">{r.licenseNumber ?? "—"}</div>
                  </td>
                  <td className={td}>{[r.district, r.city].filter(Boolean).join(", ") || "—"}</td>
                  <td className={`${td} text-ink-soft`}>{formatDate(r.submittedAt)}</td>
                  <td className={`${td} text-ink-soft`}>{formatDate(r.reviewedAt)}</td>
                  <td className={td}>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TablePanel>
    </div>
  );
}
