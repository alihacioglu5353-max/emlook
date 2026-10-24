"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/dashboard";
import { TIER_STYLE } from "@/components/data-ui";
import { Alert, Button, Spinner } from "@/components/ui";
import { api, type AdminSettings, type BadgeTierDef } from "@/lib/api";

const COLORS: [string, string][] = [
  ["ink", "Mürekkep"],
  ["bronze", "Bronz"],
  ["silver", "Gümüş"],
  ["gold", "Altın"],
  ["brand", "Emlook kırmızısı"],
  ["ok", "Yeşil"],
  ["warn", "Turuncu"],
];

export default function BadgeSettingsPage() {
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<AdminSettings>("/admin/settings") });
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  if (!q.data) return <Spinner />;
  return <BadgeForm data={q.data} />;
}

function BadgeForm({ data }: { data: AdminSettings }) {
  const qc = useQueryClient();
  const [weights, setWeights] = useState<Record<string, number>>(data.badges.weights);
  const [tiers, setTiers] = useState<BadgeTierDef[]>(data.badges.tiers);
  const [dist, setDist] = useState(data.badgeDistribution);
  const [busy, setBusy] = useState<"save" | "recompute" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const totalAgents = dist.reduce((a, d) => a + d.count, 0);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await api<{ badges: AdminSettings["badges"]; distribution: AdminSettings["badgeDistribution"] }>("/admin/settings/badges", {
        method: "PUT",
        json: { weights, tiers },
      });
      setTiers(res.badges.tiers);
      setDist(res.distribution);
      await qc.invalidateQueries({ queryKey: ["admin-settings"] });
      await qc.invalidateQueries({ queryKey: ["public-settings"] });
      setMsg({ tone: "ok", text: "Kaydedildi; tüm danışmanların puanı yeniden hesaplandı." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  async function recompute() {
    setBusy("recompute");
    try {
      const res = await api<{ distribution: AdminSettings["badgeDistribution"] }>("/admin/settings/badges/recompute", { method: "POST" });
      setDist(res.distribution);
      setMsg({ tone: "ok", text: "Puanlar yeniden hesaplandı." });
    } finally {
      setBusy(null);
    }
  }

  const sorted = [...tiers].sort((a, b) => a.minScore - b.minScore);
  const input = "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-ink focus:outline-none";

  return (
    <div className="grid gap-6">
      <p className="max-w-3xl text-sm text-ink-soft">
        Onaylı danışmanların puanı aşağıdaki ölçütlerle hesaplanır; puan, eşiğini geçtiği en yüksek rozeti belirler. Rozetler profilde, ilan kartlarında ve
        yönetim listelerinde görünür. Puanlar saatte bir ve her kayıtta yeniden hesaplanır.
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Puan ölçütleri" subtitle="Her ölçüt için verilecek puan">
          <div className="grid gap-3">
            {data.badgeMetrics.map((m) => (
              <label key={m.key} className="grid grid-cols-[1fr_110px] items-center gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-ink">{m.label}</span>
                <span className="relative">
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    className={`${input} pr-12 text-right tabular-nums`}
                    value={weights[m.key] ?? 0}
                    onChange={(e) => setWeights((w) => ({ ...w, [m.key]: Number(e.target.value) }))}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft">puan</span>
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel
          title="Rozetler ve eşikler"
          subtitle="En düşük rozetin eşiği 0 olmalı"
          actions={
            <Button
              variant="secondary"
              className="!h-8 !px-3 text-xs"
              onClick={() => setTiers((t) => [...t, { key: `rozet${t.length + 1}`, label: "Yeni rozet", minScore: (sorted.at(-1)?.minScore ?? 0) + 100, color: "brand" }])}
              disabled={tiers.length >= 8}
            >
              <Plus className="h-3.5 w-3.5" /> Ekle
            </Button>
          }
        >
          <div className="grid gap-3">
            {sorted.map((t) => {
              const i = tiers.indexOf(t);
              const set = (patch: Partial<BadgeTierDef>) => setTiers((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const d = dist.find((x) => x.key === t.key);
              return (
                <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1.2fr_1fr_90px_1fr_auto] sm:items-end">
                  <label className="grid gap-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">Ad</span>
                    <input className={input} value={t.label} onChange={(e) => set({ label: e.target.value })} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">Anahtar</span>
                    <input className={`${input} font-mono text-xs`} value={t.key} onChange={(e) => set({ key: e.target.value })} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">Eşik</span>
                    <input type="number" min={0} className={`${input} text-right tabular-nums`} value={t.minScore} onChange={(e) => set({ minScore: Number(e.target.value) })} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">Renk</span>
                    <select className={input} value={t.color} onChange={(e) => set({ color: e.target.value })}>
                      {COLORS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setTiers((all) => all.filter((_, j) => j !== i))}
                    disabled={tiers.length <= 1}
                    className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-brand-tint hover:text-brand disabled:opacity-30"
                    aria-label="Rozeti sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-2 sm:col-span-5">
                    <span className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold ${TIER_STYLE[t.color] ?? TIER_STYLE.ink}`}>★ {t.label || "—"}</span>
                    <span className="text-xs text-ink-soft">
                      {d ? `${d.count} danışman · ortalama ${d.avgScore} puan` : "Kaydedince hesaplanır"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Dağılım" subtitle={`${totalAgents} onaylı danışman`}>
        <div className="flex h-8 overflow-hidden rounded-lg border border-line">
          {dist.filter((d) => d.count > 0).map((d) => (
            <div key={d.key} title={`${d.label}: ${d.count}`} className={`grid place-items-center text-[11px] font-bold ${TIER_STYLE[d.color] ?? TIER_STYLE.ink}`} style={{ width: `${(d.count / Math.max(1, totalAgents)) * 100}%` }}>
              {d.count}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-soft">
          {dist.map((d) => (
            <span key={d.key} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${TIER_STYLE[d.color] ?? TIER_STYLE.ink}`} /> {d.label} ({d.minScore}+): {d.count}
            </span>
          ))}
        </div>
      </Panel>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={save} loading={busy === "save"}>
          <Save className="h-4 w-4" /> Kaydet ve yeniden hesapla
        </Button>
        <Button variant="secondary" onClick={recompute} loading={busy === "recompute"}>
          <RefreshCw className="h-4 w-4" /> Yalnızca yeniden hesapla
        </Button>
      </div>
    </div>
  );
}
