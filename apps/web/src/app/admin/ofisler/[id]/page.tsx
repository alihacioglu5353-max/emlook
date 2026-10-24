"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Eyebrow, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { api, type AdminOfficeDetail } from "@/lib/api";
import { OFFICE_STATUS_LABEL, formatDate, formatPhone } from "@/lib/format";
import { useAction } from "@/lib/use-action";

export default function AdminOfficeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ["admin-office", id];
  const query = useQuery({ queryKey: key, queryFn: () => api<AdminOfficeDetail>(`/admin/offices/${id}`) });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const action = useAction();

  const d = query.data;
  if (!d) return query.isError ? <Alert tone="error">{query.error.message}</Alert> : <Spinner />;

  async function decide(kind: "approve" | "reject") {
    await action.run(kind, async () => {
      const next = await api<AdminOfficeDetail>(`/admin/offices/${id}/${kind}`, {
        method: "POST",
        json: kind === "reject" ? { reason } : {},
      });
      qc.setQueryData(key, next);
      void qc.invalidateQueries({ queryKey: ["admin-offices"] });
      void qc.invalidateQueries({ queryKey: ["admin-office-counts"] });
    });
  }

  const tone = d.status === "active" ? "ok" : d.status === "pending" ? "warn" : "error";

  return (
    <div className="max-w-4xl">
      <Link href="/admin/ofisler" className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Ofis başvuruları
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{d.name}</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            tone === "ok"
              ? "bg-ok-tint text-ok"
              : tone === "warn"
                ? "bg-warn-tint text-warn"
                : "bg-brand-tint text-brand-ink"
          }`}
        >
          {OFFICE_STATUS_LABEL[d.status]}
        </span>
      </div>
      <p className="mt-1 text-ink-soft">
        Başvuru {formatDate(d.createdAt)} · {d.memberCount} aktif üye
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <Eyebrow>Ofis beyanı</Eyebrow>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <Row k="Ticari unvan" v={d.legalName} />
            <Row k="Yetki belgesi no" v={d.licenseNumber} strong />
            <Row k="Bölge" v={`${d.district}, ${d.city}`} />
            <Row k="Adres" v={d.address} />
            <Row k="Telefon" v={d.phone} />
            <Row k="E-posta" v={d.email} />
          </dl>
        </Card>

        <Card>
          <Eyebrow>Sahip (danışman doğrulaması)</Eyebrow>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="font-semibold">{d.owner.fullName ?? "—"}</p>
            {d.owner.verificationStatus && <StatusBadge status={d.owner.verificationStatus} />}
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <Row k="Telefon" v={formatPhone(d.owner.phone)} />
            <Row k="Belgedeki unvan" v={d.owner.businessName} />
            <Row k="Belge no" v={d.owner.licenseNumber} strong />
          </dl>
          <div className="mt-4">
            {d.owner.licenseMatches ? (
              <Alert tone="ok">Ofis belge numarası sahibin onaylı belge numarasıyla eşleşiyor.</Alert>
            ) : (
              <Alert tone="warn">
                Belge numaraları farklı. Sahip başka bir işletmenin danışmanıysa ofis belgesini ayrıca doğrula.
              </Alert>
            )}
          </div>
          <Link
            href={`/admin/basvurular/${d.owner.id}`}
            className="mt-4 inline-block text-sm font-semibold text-ink hover:text-brand"
          >
            Danışman başvurusunu ve belgelerini gör →
          </Link>
        </Card>
      </div>

      <div className="mt-6">
        {d.status === "pending" ? (
          <Card>
            <Eyebrow>Karar</Eyebrow>
            {rejecting ? (
              <div className="mt-3 space-y-3">
                <Textarea
                  autoFocus
                  placeholder="Sahibin göreceği gerekçe"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
                <div className="flex gap-3">
                  <Button
                    variant="danger"
                    disabled={reason.trim().length < 5}
                    loading={action.busy === "reject"}
                    onClick={() => decide("reject")}
                  >
                    Reddet
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(false)}>
                    Vazgeç
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-3">
                <Button loading={action.busy === "approve"} onClick={() => decide("approve")}>
                  Ofisi onayla
                </Button>
                <Button variant="danger" onClick={() => setRejecting(true)}>
                  Reddet…
                </Button>
              </div>
            )}
            {action.error && (
              <div className="mt-4">
                <Alert tone="error">{action.error}</Alert>
              </div>
            )}
          </Card>
        ) : d.status === "rejected" && d.rejectionReason ? (
          <Alert tone="error" title="Ret gerekçesi">
            {d.rejectionReason}
          </Alert>
        ) : (
          d.reviewedAt && <Alert tone="ok">{formatDate(d.reviewedAt)} tarihinde onaylandı.</Alert>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string | null; strong?: boolean }) {
  return (
    <>
      <dt className="text-ink-soft">{k}</dt>
      <dd className={strong ? "font-bold" : "font-medium"}>{v || "—"}</dd>
    </>
  );
}
