"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ReasonAction } from "@/components/admin";
import { Alert, Button, EmptyState, Spinner } from "@/components/ui";
import { api, type AdminReport } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { REPORT_REASON_LABEL } from "@/lib/listing";
import { useAction } from "@/lib/use-action";

type Status = "open" | "resolved" | "dismissed";
const TABS: [Status, string][] = [
  ["open", "Açık"],
  ["resolved", "Çözüldü"],
  ["dismissed", "Reddedildi"],
];

export default function AdminReports() {
  const [status, setStatus] = useState<Status>("open");
  const qc = useQueryClient();
  const action = useAction();
  const q = useQuery({
    queryKey: ["admin-reports", status],
    queryFn: () => api<{ items: AdminReport[] }>(`/admin/reports?status=${status}&limit=100`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-reports"] });
    void qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex gap-1">
        {TABS.map(([s, label]) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === s ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {action.error && <Alert tone="error">{action.error}</Alert>}
      {q.isError ? (
        <Alert tone="error">{q.error.message}</Alert>
      ) : !q.data ? (
        <Spinner />
      ) : q.data.items.length === 0 ? (
        <EmptyState>{status === "open" ? "Açık şikâyet yok." : "Kayıt yok."}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((r) => (
            <li key={r.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[11px] font-bold text-brand-ink">
                  {REPORT_REASON_LABEL[r.reason]}
                </span>
                {r.sameListingOpen > 1 && status === "open" && (
                  <span className="text-xs font-semibold text-brand">Bu ilana {r.sameListingOpen} açık şikâyet</span>
                )}
                <span className="text-xs text-ink-soft">{timeAgo(r.createdAt)}</span>
              </div>
              <p className="font-semibold">
                <Link href={`/ilan/${r.listing.id}`} className="hover:underline">
                  {r.listing.title}
                </Link>
                <span className="font-normal text-ink-soft">
                  {" "}
                  · <Link href={`/admin/kullanicilar/${r.owner.id}`} className="hover:underline">{r.owner.fullName}</Link>
                </span>
              </p>
              {r.note && <p className="rounded-lg bg-paper p-3 text-sm">“{r.note}”</p>}
              <p className="text-xs text-ink-soft">
                Bildiren: {r.reporter.fullName} ({r.reporter.role === "agent" ? "danışman" : "mülk sahibi"})
              </p>
              {r.resolution && <p className="text-sm text-ink-soft">Sonuç: {r.resolution}</p>}
              {status === "open" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <ReasonAction
                    label="İlanı kaldır"
                    placeholder="Kaldırma gerekçesi (danışmana bildirilir)"
                    confirmLabel="Yayından kaldır"
                    busy={action.busy === `remove:${r.id}`}
                    onSubmit={(reason) =>
                      action.run(`remove:${r.id}`, async () => {
                        await api(`/admin/listings/${r.listing.id}/remove`, { json: { reason } });
                        refresh();
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    className="!h-9"
                    loading={action.busy === `dismiss:${r.id}`}
                    onClick={() =>
                      action.run(`dismiss:${r.id}`, async () => {
                        await api(`/admin/reports/${r.id}/dismiss`, { json: {} });
                        refresh();
                      })
                    }
                  >
                    Sorun yok, kapat
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
