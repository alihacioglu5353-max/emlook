"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useMe } from "@/components/app-shell";
import {
  Alert,
  Button,
  Card,
  Eyebrow,
  Field,
  Input,
  Spinner,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { api, fileUrl, type Verification, type VerificationDoc } from "@/lib/api";
import { DOC_LABEL, MISSING_LABEL, formatBytes, formatDate } from "@/lib/format";

const VERIFICATION_KEY = ["agent-verification"] as const;

export default function VerificationPage() {
  const { me, reload: reloadMe } = useMe();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: VERIFICATION_KEY,
    queryFn: () => api<Verification>("/agents/me/verification"),
    enabled: me.role === "agent",
  });
  const data = query.data;

  if (me.role !== "agent") {
    return <Alert>Bu sayfa yalnızca emlak danışmanları içindir.</Alert>;
  }
  if (!data) {
    return query.isError ? <Alert tone="error">{query.error.message}</Alert> : <Spinner />;
  }

  const editable = data.status === "draft" || data.status === "rejected";

  async function onChanged(next: Verification) {
    const prev = qc.getQueryData<Verification>(VERIFICATION_KEY);
    qc.setQueryData(VERIFICATION_KEY, next);
    if (next.status !== prev?.status) await reloadMe();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Eyebrow>Danışman onayı</Eyebrow>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">Onay başvurusu</h1>
          <StatusBadge status={data.status} />
        </div>
        <p className="mt-2 text-ink-soft">
          Taşınmaz Ticareti Yetki Belgeni doğrulayarak onaylı danışman rozeti alırsın.
        </p>
      </div>

      {data.status === "pending" && (
        <Alert tone="warn" title="Başvurun incelemede">
          {formatDate(data.submittedAt)} tarihinde gönderildi. İnceleme sürerken bilgiler
          değiştirilemez.
        </Alert>
      )}
      {data.status === "rejected" && data.rejectionReason && (
        <Alert tone="error" title="Başvurun reddedildi">
          <p>Gerekçe: {data.rejectionReason}</p>
          <p className="mt-1">Bilgilerini düzeltip yeniden gönderebilirsin.</p>
        </Alert>
      )}
      {data.status === "approved" && (
        <Alert tone="ok" title="Onaylı danışmansın">
          {formatDate(data.reviewedAt)} tarihinde onaylandı.
        </Alert>
      )}

      <ProfileForm data={data} editable={editable} onSaved={onChanged} />
      <Documents data={data} editable={editable} onChanged={onChanged} />
      {editable && <Submit data={data} onSubmitted={onChanged} />}
    </div>
  );
}

function ProfileForm({
  data,
  editable,
  onSaved,
}: {
  data: Verification;
  editable: boolean;
  onSaved: (v: Verification) => void;
}) {
  const [form, setForm] = useState({
    licenseNumber: data.profile.licenseNumber ?? "",
    businessName: data.profile.businessName ?? "",
    city: data.profile.city ?? "",
    district: data.profile.district ?? "",
    bio: data.profile.bio ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = Object.fromEntries(
        Object.entries(form).filter(([k, v]) => v.trim() !== "" || k === "bio"),
      );
      onSaved(await api<Verification>("/agents/me/profile", { method: "PATCH", json: body }));
      setMsg({ tone: "ok", text: "Bilgiler kaydedildi" });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">Yetki belgesi bilgileri</h2>
      <form onSubmit={save} className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Yetki belgesi numarası">
          <Input value={form.licenseNumber} onChange={set("licenseNumber")} disabled={!editable} />
        </Field>
        <Field label="İşletme unvanı" hint="Belgede yazan unvan">
          <Input value={form.businessName} onChange={set("businessName")} disabled={!editable} />
        </Field>
        <Field label="İl">
          <Input value={form.city} onChange={set("city")} disabled={!editable} />
        </Field>
        <Field label="İlçe">
          <Input value={form.district} onChange={set("district")} disabled={!editable} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Kısa tanıtım" hint="İsteğe bağlı, en fazla 600 karakter">
            <Textarea
              value={form.bio}
              onChange={set("bio")}
              maxLength={600}
              disabled={!editable}
            />
          </Field>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <Button type="submit" variant="secondary" loading={busy}>
              Kaydet
            </Button>
            {msg && (
              <span className={msg.tone === "ok" ? "text-sm text-ok" : "text-sm text-brand"}>
                {msg.text}
              </span>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

function Documents({
  data,
  editable,
  onChanged,
}: {
  data: Verification;
  editable: boolean;
  onChanged: (v: Verification) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<VerificationDoc["type"]>("authority_certificate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("type", type);
    form.append("file", file);
    try {
      onChanged(await api<Verification>("/agents/me/documents", { form }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      onChanged(await api<Verification>(`/agents/me/documents/${id}`, { method: "DELETE" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">Belgeler</h2>
      <p className="mt-1 text-sm text-ink-soft">PDF, JPG veya PNG · en fazla 10 MB</p>

      {data.documents.length > 0 && (
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {data.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink-soft">
                {DOC_LABEL[d.type]}
              </span>
              <a
                href={fileUrl(`/agents/me/documents/${d.id}/file`)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-brand"
              >
                {d.originalName}
              </a>
              <span className="text-xs text-ink-soft">{formatBytes(d.sizeBytes)}</span>
              {editable && (
                <button
                  onClick={() => remove(d.id)}
                  className="text-xs font-semibold text-ink-soft hover:text-brand"
                >
                  Kaldır
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label="Belge türü">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as VerificationDoc["type"])}
              className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
            >
              {Object.entries(DOC_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <Button variant="ghost" loading={busy} onClick={() => input.current?.click()}>
            Dosya seç ve yükle
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

function Submit({
  data,
  onSubmitted,
}: {
  data: Verification;
  onSubmitted: (v: Verification) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onSubmitted(await api<Verification>("/agents/me/submit", { method: "POST" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-ink text-white">
      <h2 className="text-lg font-bold">İncelemeye gönder</h2>
      {data.missing.length > 0 ? (
        <>
          <p className="mt-1 text-sm text-white/70">Göndermeden önce şunları tamamla:</p>
          <ul className="mt-3 list-inside list-disc text-sm text-white/90">
            {data.missing.map((m) => (
              <li key={m}>{MISSING_LABEL[m] ?? m}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-sm text-white/70">
          Her şey hazır. Gönderdikten sonra inceleme bitene kadar bilgiler kilitlenir.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-[#ff9aa8]">{error}</p>}
      <Button
        className="mt-5"
        onClick={submit}
        loading={busy}
        disabled={data.missing.length > 0}
      >
        Başvuruyu gönder
      </Button>
    </Card>
  );
}
