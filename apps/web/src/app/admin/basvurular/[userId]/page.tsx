"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Eyebrow,
  Spinner,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { api, fileUrl, type AdminDetail, type VerificationDoc } from "@/lib/api";
import { DOC_LABEL, formatBytes, formatDate, formatPhone } from "@/lib/format";

export default function AdminVerificationDetail() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();
  const key = ["admin-verification", userId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<AdminDetail>(`/admin/verifications/${userId}`),
  });
  const data = query.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!data) {
    return query.isError ? <Alert tone="error">{query.error.message}</Alert> : <Spinner />;
  }

  const preview: VerificationDoc | null =
    data.documents.find((d) => d.id === selectedId) ?? data.documents[0] ?? null;
  const setPreview = (d: VerificationDoc) => setSelectedId(d.id);
  const setData = (next: AdminDetail) => {
    qc.setQueryData(key, next);
    // Liste ve sayılar değişti
    void qc.invalidateQueries({ queryKey: ["admin-verifications"] });
    void qc.invalidateQueries({ queryKey: ["admin-counts"] });
  };

  const p = data.profile;
  return (
    <div>
      <Link href="/admin/basvurular" className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Başvurular
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{data.user.fullName ?? "—"}</h1>
        <StatusBadge status={data.status} />
      </div>
      <p className="mt-1 text-ink-soft">
        {formatPhone(data.user.phone)}
        {data.user.email && <> · {data.user.email}</>} · Kayıt {formatDate(data.user.createdAt)}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Card>
            <Eyebrow>Beyan edilen bilgiler</Eyebrow>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <Row k="Yetki belgesi no" v={p.licenseNumber} strong />
              <Row k="İşletme unvanı" v={p.businessName} />
              <Row k="Bölge" v={[p.district, p.city].filter(Boolean).join(", ")} />
              <Row k="Gönderim" v={formatDate(data.submittedAt)} />
              {data.reviewedAt && <Row k="Son inceleme" v={formatDate(data.reviewedAt)} />}
            </dl>
            {p.bio && <p className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">{p.bio}</p>}
            {data.status === "rejected" && data.rejectionReason && (
              <div className="mt-4">
                <Alert tone="error" title="Ret gerekçesi">
                  {data.rejectionReason}
                </Alert>
              </div>
            )}
          </Card>

          {data.status === "pending" ? (
            <Decision userId={userId} onDone={setData} />
          ) : (
            <Alert>
              Yalnızca incelemedeki başvurular onaylanabilir veya reddedilebilir.
            </Alert>
          )}
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap gap-2 border-b border-line p-4">
            {data.documents.length === 0 && (
              <span className="text-sm text-ink-soft">Belge yüklenmemiş.</span>
            )}
            {data.documents.map((d) => (
              <button
                key={d.id}
                onClick={() => setPreview(d)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  preview?.id === d.id
                    ? "border-ink bg-ink text-white"
                    : "border-line text-ink-soft hover:text-ink"
                }`}
              >
                {DOC_LABEL[d.type]} · {formatBytes(d.sizeBytes)}
              </button>
            ))}
          </div>
          {preview && (
            <div className="bg-paper">
              {preview.mimeType === "application/pdf" ? (
                <iframe
                  title={preview.originalName}
                  src={fileUrl(`/admin/documents/${preview.id}/file`)}
                  className="h-[640px] w-full"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={preview.originalName}
                  src={fileUrl(`/admin/documents/${preview.id}/file`)}
                  className="mx-auto max-h-[640px] object-contain"
                />
              )}
              <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-3 text-xs text-ink-soft">
                <span className="truncate">{preview.originalName}</span>
                <a
                  href={fileUrl(`/admin/documents/${preview.id}/file`)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-ink hover:text-brand"
                >
                  Yeni sekmede aç
                </a>
              </div>
            </div>
          )}
        </Card>
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

function Decision({ userId, onDone }: { userId: string; onDone: (d: AdminDetail) => void }) {
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      onDone(
        await api<AdminDetail>(`/admin/verifications/${userId}/${kind}`, {
          method: "POST",
          json: kind === "reject" ? { reason } : {},
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <Eyebrow>Karar</Eyebrow>
      <p className="text-sm text-ink-soft">
        Belgedeki numara ve unvanın beyanla eşleştiğini kontrol et.
      </p>
      {mode === "reject" ? (
        <div className="mt-4 space-y-3">
          <Textarea
            autoFocus
            placeholder="Danışmanın göreceği gerekçe (örn. belge okunmuyor, net bir kopya yükleyin)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              loading={busy === "reject"}
              disabled={reason.trim().length < 5}
              onClick={() => act("reject")}
            >
              Reddet
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button loading={busy === "approve"} onClick={() => act("approve")}>
            Onayla
          </Button>
          <Button variant="danger" onClick={() => setMode("reject")}>
            Reddet…
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </Card>
  );
}
