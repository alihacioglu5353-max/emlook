"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { TablePanel, td, th } from "@/components/data-ui";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, type DocumentTypeRow } from "@/lib/api";

const empty = { key: "", label: "", description: "", required: false, active: true, sortOrder: 50 };
type Form = typeof empty & { id?: string };

export default function DocumentTypesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-doc-types"], queryFn: () => api<DocumentTypeRow[]>("/admin/document-types") });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const body = { key: form.key, label: form.label, description: form.description || undefined, required: form.required, active: form.active, sortOrder: Number(form.sortOrder) };
      if (form.id) await api(`/admin/document-types/${form.id}`, { method: "PATCH", json: body });
      else await api("/admin/document-types", { json: body });
      setForm(null);
      await qc.invalidateQueries({ queryKey: ["admin-doc-types"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: DocumentTypeRow) {
    setError(null);
    try {
      await api(`/admin/document-types/${row.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["admin-doc-types"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const input = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-ink focus:outline-none";
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Danışmanların onay başvurusunda yükleyeceği belgeler. Zorunlu belgeler yüklenmeden başvuru gönderilemez. Kabul edilen biçimler: PDF, JPG, PNG, BMP,
          WEBP.
        </p>
        <Button onClick={() => setForm({ ...empty })}>
          <Plus className="h-4 w-4" /> Evrak türü ekle
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {form && (
        <section className="grid gap-4 rounded-[10px] border border-line bg-surface p-5 shadow-sm sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h2 className="font-bold">{form.id ? "Evrak türünü düzenle" : "Yeni evrak türü"}</h2>
            <button onClick={() => setForm(null)} className="text-ink-soft hover:text-ink" aria-label="Kapat">
              <X className="h-5 w-5" />
            </button>
          </div>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Ad *</span>
            <input className={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Vergi levhası" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Anahtar *</span>
            <input
              className={`${input} font-mono text-xs`}
              value={form.key}
              disabled={!!form.id}
              onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              placeholder="tax_plate"
            />
          </label>
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-sm font-semibold">Açıklama (başvuru ekranında görünür)</span>
            <input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Sıra</span>
            <input type="number" className={input} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          </label>
          <div className="flex items-end gap-5">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> Zorunlu
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Etkin
            </label>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={save} loading={busy} disabled={form.label.length < 2 || form.key.length < 2}>
              Kaydet
            </Button>
          </div>
        </section>
      )}

      <TablePanel>
        {!q.data ? (
          <div className="px-6">
            <Spinner />
          </div>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line bg-paper">
              <tr>
                <th className={th}>Sıra</th>
                <th className={th}>Evrak</th>
                <th className={th}>Anahtar</th>
                <th className={th}>Zorunlu</th>
                <th className={th}>Durum</th>
                <th className={`${th} text-right`}>Yüklenen</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <td className={`${td} tabular-nums text-ink-soft`}>{r.sortOrder}</td>
                  <td className={td}>
                    <p className="font-semibold text-ink">{r.label}</p>
                    {r.description && <p className="text-xs text-ink-soft">{r.description}</p>}
                  </td>
                  <td className={`${td} font-mono text-xs text-ink-soft`}>{r.key}</td>
                  <td className={td}>
                    {r.required ? <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand">Zorunlu</span> : <span className="text-xs text-ink-soft">İsteğe bağlı</span>}
                  </td>
                  <td className={td}>{r.active ? <span className="text-xs font-semibold text-ok">Etkin</span> : <span className="text-xs text-ink-soft">Pasif</span>}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.uploads}</td>
                  <td className={`${td} text-right`}>
                    <span className="inline-flex gap-1">
                      <button
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink"
                        aria-label="Düzenle"
                        onClick={() => setForm({ id: r.id, key: r.key, label: r.label, description: r.description ?? "", required: r.required, active: r.active, sortOrder: r.sortOrder })}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-brand-tint hover:text-brand disabled:opacity-30"
                        aria-label="Sil"
                        disabled={r.uploads > 0}
                        title={r.uploads > 0 ? "Yüklenmiş belgesi olan tür silinemez; pasife alın" : "Sil"}
                        onClick={() => remove(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
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
