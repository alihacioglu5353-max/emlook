"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type PayoutAccount } from "@/lib/api";
import { Alert, Button, Field, Input } from "./ui";

export const PAYOUT_KEY = ["payout-account"] as const;

/** IBAN hesabı kartı: görüntüle / düzenle */
export function PayoutAccountCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: PAYOUT_KEY,
    queryFn: () => api<{ account: PayoutAccount | null }>("/me/payout-account"),
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ holderName: "", iban: "", taxId: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!q.data) return null;
  const acc = q.data.account;
  const showForm = editing || !acc;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ account: PayoutAccount }>("/me/payout-account", { method: "PUT", json: form });
      qc.setQueryData(PAYOUT_KEY, res);
      void qc.invalidateQueries({ queryKey: ["payment-summary"] });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Ödeme alacağın hesap</h2>
          <p className="text-sm text-ink-soft">Komisyon payın bu IBAN&apos;a aktarılır.</p>
        </div>
        {acc && !editing && (
          <button type="button" className="text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => setEditing(true)}>
            Değiştir
          </button>
        )}
      </div>
      {acc && !editing && (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-soft">Hesap sahibi</dt>
            <dd className="font-semibold">{acc.holderName}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">IBAN</dt>
            <dd className="font-mono font-semibold">{acc.iban}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Durum</dt>
            <dd className={`font-semibold ${acc.status === "verified" ? "text-ok" : "text-warn"}`}>
              {acc.status === "verified" ? "Onaylı" : acc.status === "pending" ? "İnceleniyor" : "Reddedildi"}
            </dd>
          </div>
        </dl>
      )}
      {showForm && (
        <form onSubmit={save} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hesap sahibi (ad soyad / unvan)">
              <Input required minLength={3} value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} />
            </Field>
            <Field label="TCKN / VKN">
              <Input
                required
                inputMode="numeric"
                maxLength={11}
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </div>
          <Field label="IBAN">
            <Input
              required
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              className="font-mono"
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })}
            />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              Kaydet
            </Button>
            {acc && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Vazgeç
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
