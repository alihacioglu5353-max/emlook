"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { FilterTabs, PAGE_SIZE, Pagination } from "@/components/data-ui";
import { Alert, Card, Spinner } from "@/components/ui";
import { api, type AdminOfficeItem, type OfficeStatus } from "@/lib/api";
import { OFFICE_STATUS_LABEL, formatDate, formatPhone } from "@/lib/format";

const TABS: [OfficeStatus, string][] = (["pending", "active", "rejected", "suspended"] as OfficeStatus[]).map((t) => [t, OFFICE_STATUS_LABEL[t]]);

export default function AdminOffices() {
  const [status, setStatus] = useState<OfficeStatus | "">("");
  const [offset, setOffset] = useState(0);
  const counts = useQuery({
    queryKey: ["admin-office-counts"],
    queryFn: () => api<Record<OfficeStatus, number>>("/admin/offices/counts"),
  }).data;
  const list = useQuery({
    queryKey: ["admin-offices", status, offset],
    queryFn: () => api<{ items: AdminOfficeItem[]; total: number }>(`/admin/offices?status=${status || "all"}&limit=${PAGE_SIZE}&offset=${offset}`),
  });

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Ofis unvanı ve yetki belgesi numarasının sahibin onaylı danışman bilgileriyle tutarlı olduğunu kontrol et.
      </p>

      <div className="mt-5">
        <FilterTabs
          value={status}
          options={TABS}
          counts={counts && { "": Object.values(counts).reduce((a, b) => a + b, 0), ...counts }}
          onChange={(v) => {
            setStatus(v);
            setOffset(0);
          }}
        />
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
            Bu filtrede ofis yok.
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
                  <th className="px-6 py-3 font-semibold">Başvuru</th>
                  <th className="px-6 py-3 font-semibold">Durum</th>
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
                    <td className="px-6 py-4 text-ink-soft">{formatDate(o.createdAt)}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${o.status === "active" ? "bg-ok-tint text-ok" : o.status === "pending" ? "bg-warn-tint text-warn" : "bg-brand-tint text-brand"}`}>
                        {OFFICE_STATUS_LABEL[o.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {list.data && (
        <div className="mt-3">
          <Pagination total={list.data.total} offset={offset} onChange={setOffset} />
        </div>
      )}
    </div>
  );
}
