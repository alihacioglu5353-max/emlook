"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleCheck, CircleDashed, Cloud, CreditCard, FileText, Flame, Landmark, Mail, MessageSquareText, PlugZap, Save } from "lucide-react";
import { useState, type ComponentType } from "react";
import { SettingsFieldInput } from "@/components/settings-form";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, type AdminSettings, type IntegrationView } from "@/lib/api";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  netgsm: MessageSquareText,
  smtp: Mail,
  trinkle360: CreditCard,
  fcm: Flame,
  s3: Cloud,
  eids: Landmark,
  efatura: FileText,
};
const APPLY: Record<IntegrationView["apply"], string> = {
  live: "Kaydedince hemen uygulanır",
  restart: "API yeniden başlatılınca uygulanır",
  pending: "Ayarlar saklanır; entegrasyon kodu sözleşme ve API dokümanı gelince bağlanacak",
};

export default function IntegrationsPage() {
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<AdminSettings>("/admin/settings") });
  const [open, setOpen] = useState<string | null>(null);
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  const cats = [...new Set(q.data.integrations.map((i) => i.category))];
  return (
    <div className="grid gap-6">
      <p className="max-w-3xl text-sm text-ink-soft">
        Dış servislerin bağlantı bilgileri. Gizli değerler (parola, anahtar) şifreli saklanır ve bir daha gösterilmez. Bir entegrasyon kapalıyken sunucunun ortam
        değişkenlerindeki ayar kullanılır.
      </p>
      {cats.map((cat) => (
        <section key={cat} className="grid gap-3">
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">{cat}</h2>
          {q.data.integrations
            .filter((i) => i.category === cat)
            .map((i) => (
              <IntegrationCard key={i.name} item={i} open={open === i.name} onToggle={() => setOpen(open === i.name ? null : i.name)} />
            ))}
        </section>
      ))}
    </div>
  );
}

function IntegrationCard({ item, open, onToggle }: { item: IntegrationView; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const Icon = ICONS[item.name] ?? PlugZap;
  // Gizli alanlar boş başlar (boş gönderim mevcut değeri korur)
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(item.fields.map((f) => [f.key, f.type === "secret" ? "" : item.values[f.key]])),
  );
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [to, setTo] = useState("");
  const enabled = item.values.enabled === true;

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      await api(`/admin/settings/integrations/${item.name}`, { method: "PUT", json: values });
      await qc.invalidateQueries({ queryKey: ["admin-settings"] });
      setValues((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, item.fields.find((f) => f.key === k)?.type === "secret" ? "" : x])));
      setMsg({ tone: "ok", text: "Kaydedildi." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  async function test() {
    setBusy("test");
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; message: string }>(`/admin/settings/integrations/${item.name}/test`, { json: { to } });
      setMsg({ tone: r.ok ? "ok" : "error", text: r.message });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-[0_1px_2px_rgba(22,23,28,.05)]">
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-paper/40" aria-expanded={open}>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${enabled ? "bg-brand text-white" : "bg-paper text-ink-soft"}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink">{item.title}</span>
            {enabled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-0.5 text-[11px] font-bold text-ok">
                <CircleCheck className="h-3 w-3" /> Etkin
              </span>
            ) : item.configured ? (
              <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-bold text-ink-soft">Tanımlı · kapalı</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                <CircleDashed className="h-3 w-3" /> Tanımlı değil
              </span>
            )}
            {item.apply === "pending" && <span className="rounded-full bg-warn-tint px-2 py-0.5 text-[11px] font-bold text-warn">Entegrasyon bekleniyor</span>}
          </span>
          <span className="truncate text-xs text-ink-soft">
            {item.description} · Şu an: {enabled ? "bu ayarlar" : `sunucu ayarı (${item.envFallback})`}
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 text-ink-soft transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-line px-5 py-5">
          <p className="mb-4 text-xs text-ink-soft">{APPLY[item.apply]}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {item.fields.map((f) => (
              <SettingsFieldInput
                key={f.key}
                field={f}
                value={values[f.key]}
                secretInfo={f.type === "secret" ? (item.values[f.key] as { configured: boolean; hint: string | null }) : undefined}
                onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              />
            ))}
          </div>
          {item.missing.length > 0 && <p className="mt-3 text-xs text-warn">Etkinleştirmek için eksik: {item.missing.join(", ")}</p>}
          {msg && (
            <div className="mt-4">
              <Alert tone={msg.tone}>{msg.text}</Alert>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <Button onClick={save} loading={busy === "save"}>
              <Save className="h-4 w-4" /> Kaydet
            </Button>
            {item.testable && (
              <>
                {(item.name === "netgsm" || item.name === "smtp") && (
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder={item.name === "netgsm" ? "Test için cep telefonu" : "Test için e-posta"}
                    className="h-11 w-60 rounded-full border border-line bg-surface px-4 text-sm focus:border-ink focus:outline-none"
                  />
                )}
                <Button variant="secondary" onClick={test} loading={busy === "test"}>
                  <PlugZap className="h-4 w-4" /> Bağlantıyı test et
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
