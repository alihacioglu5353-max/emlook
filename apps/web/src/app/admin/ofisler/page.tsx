"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Alert, Card, Spinner } from "@/components/ui";
import { api, type AdminOfficeItem, type OfficeStatus } from "@/lib/api";
import { OFFICE_STATUS_LABEL, formatDate, formatPhone } from "@/lib/format";

const TABS: OfficeStatus[] = ["pending", "active", "rejected"];

export default function AdminOffices() {
  const [status, setStatus] = useState<OfficeStatus>("pending");
  const counts = useQuery({
    queryKey: ["admin-office-counts"],
    queryFn: () => api<Record<OfficeStatus, number>>("/admin/offices/counts"),
  }).data;
  const list = useQuery({
    queryKey: ["admin-offices", status],
    queryFn: () => api<{ items: AdminOfficeItem[]; total: number }>(`/admin/offices?status=${status}&limit=50`),
  });

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Ofis unvanı ve yetki belgesi numarasının sahibin onaylı danışman bilgileriyle tutarlı olduğunu kontrol et.
      </p>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={status === t}
            onClick={() => setStatus(t)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              status === t ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft hover:text-ink"
            }`}
          >
            {OFFICE_STATUS_LABEL[t]}
            {counts && (
              <span className={`rounded-full px-2 text-xs ${status === t ? "bg-white/20" : "bg-paper"}`}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card className="mt-6 !p-0 overflow-hidden">
        {list.isError ? (
          <div className="p-6">
            <Alert tone="error">{list.error.message}</Alert>
          </div>
        ) : !list.data ? (
          <div className="px-6">
            <Spinner />
          </div>
        ) : list.data.items.length === 0 ? (
          <p className="p-10 text-center text-ink-soft">
            {status === "pending" ? "Bekleyen ofis başvurusu yok." : "Bu durumda ofis yok."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-6 py-3 font-semibold">Ofis</th>
                  <th className="px-6 py-3 font-semibold">Unvan / belge no</th>
                  <th className="px-6 py-3 font-semibold">Sahip</th>
                  <th className="px-6 py-3 font-semibold">Bölge</th>
                  <th className="px-6 py-3 font-semibold">{status === "pending" ? "Başvuru" : "Son işlem"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((o) => (
                  <tr key={o.id} className="hover:bg-paper/60">
                    <td className="px-6 py-4">
                      <Link href={`/admin/ofisler/${o.id}`} className="font-semibold hover:text-brand">
                        {o.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div>{o.legalName}</div>
                      <div className="text-xs text-ink-soft">{o.licenseNumber}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{o.owner.fullName ?? "—"}</div>
                      <div className="text-xs text-ink-soft">{formatPhone(o.owner.phone)}</div>
                    </td>
                    <td className="px-6 py-4">
                      {o.district}, {o.city}
                    </td>
                    <td className="px-6 py-4 text-ink-soft">
                      {formatDate(status === "pending" ? o.createdAt : o.reviewedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
