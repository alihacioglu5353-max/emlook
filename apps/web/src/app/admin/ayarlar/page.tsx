"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, FileStack, Plug, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Panel } from "@/components/dashboard";
import { SettingsFieldInput } from "@/components/settings-form";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, type AdminSettings } from "@/lib/api";

export default function GeneralSettingsPage() {
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<AdminSettings>("/admin/settings") });
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  return <GeneralForm data={q.data} />;
}

function GeneralForm({ data }: { data: AdminSettings }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(data.general);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/admin/settings/general", { method: "PUT", json: values });
      await qc.invalidateQueries({ queryKey: ["admin-settings"] });
      await qc.invalidateQueries({ queryKey: ["public-settings"] });
      setMsg({ tone: "ok", text: "Genel ayarlar kaydedildi." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const groups: [string, string[]][] = [
    ["İletişim", ["supportEmail", "supportPhone"]],
    ["Ödeme ve fatura", ["platformFeeBps", "vatRateBps", "paymentLinkDays"]],
    ["Portföy", ["maxListingPhotos", "defaultCobrokeShare"]],
    ["İzleme ve duyuru", ["onlineWindowMinutes", "announcement"]],
  ];
  const live = data.integrations.filter((i) => i.values.enabled === true).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-6">
        {groups.map(([title, keys]) => (
          <Panel key={title} title={title}>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.generalFields
                .filter((f) => keys.includes(f.key))
                .map((f) => (
                  <SettingsFieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
                ))}
            </div>
            {title === "Ödeme ve fatura" && (
              <p className="mt-3 text-xs text-ink-soft">
                Önizleme: 100.000 ₺ komisyonda platform bedeli{" "}
                <strong className="text-ink">{((100_000 * Number(values.platformFeeBps ?? 0)) / 10_000).toLocaleString("tr-TR")} ₺</strong> (KDV dahil, KDV %
                {Number(values.vatRateBps ?? 0) / 100}).
              </p>
            )}
          </Panel>
        ))}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div>
          <Button onClick={save} loading={busy}>
            <Save className="h-4 w-4" /> Kaydet
          </Button>
        </div>
      </div>

      <aside className="grid content-start gap-4">
        {(
          [
            ["/admin/ayarlar/rozetler", Award, "Rozetler ve puan", `${data.badges.tiers.length} rozet · ${data.badgeDistribution.reduce((a, d) => a + d.count, 0)} rozetli danışman`],
            ["/admin/ayarlar/evraklar", FileStack, "Evrak türleri", "Danışman onayı için istenen belgeler"],
            ["/admin/ayarlar/entegrasyonlar", Plug, "Entegrasyonlar", `${live} / ${data.integrations.length} entegrasyon ayarlardan etkin`],
          ] as const
        ).map(([href, Icon, title, text]) => (
          <Link key={href} href={href} className="flex items-start gap-3 rounded-[10px] border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(22,23,28,.05)] transition hover:border-ink-soft/40">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-bold text-ink">{title}</span>
              <span className="block text-xs text-ink-soft">{text}</span>
            </span>
          </Link>
        ))}
        <p className="rounded-[10px] border border-line bg-paper p-4 text-xs leading-relaxed text-ink-soft">
          Burada boş bırakılan ayarlar sunucunun ortam değişkenlerinden okunur. Değişiklikler kaydedildiği anda (en geç 15 sn içinde) uygulanır.
        </p>
      </aside>
    </div>
  );
}
