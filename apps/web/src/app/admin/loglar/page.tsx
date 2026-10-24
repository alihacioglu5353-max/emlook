"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleUserRound, KeyRound, LogIn, MonitorSmartphone, RefreshCw, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LineChart, Panel, StatCard } from "@/components/dashboard";
import { FilterSelect, FilterTabs, PAGE_SIZE, Pagination, SearchBox, TablePanel, td, th } from "@/components/data-ui";
import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ACTION_LABEL, actionTone, deviceLabel } from "@/lib/audit";
import { formatPhone, timeAgo } from "@/lib/format";

interface Overview {
  onlineWindowMinutes: number;
  online: number;
  activeToday: number;
  active7d: number;
  openSessions: number;
  logins24h: number;
  failed24h: number;
  listingEvents24h: number;
  events24h: number;
  hourly: { hour: string; logins: number; events: number }[];
  categories: { key: string; label: string }[];
}
interface EventRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
}
interface OnlineRow {
  id: string;
  fullName: string | null;
  phone: string;
  role: string | null;
  lastSeenAt: string;
  online: boolean;
  ip: string | null;
  userAgent: string | null;
  sessions: number;
  office: string | null;
}
interface SessionRow {
  id: string;
  userId: string;
  fullName: string | null;
  role: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

type Tab = "online" | "today" | "sessions";
const ROLE: Record<string, string> = { agent: "Danışman", consumer: "Mülk sahibi", admin: "Yönetici" };
const TONE_DOT = { ok: "bg-ok", warn: "bg-warn", brand: "bg-brand", neutral: "bg-ink-soft/40", ink: "bg-ink" };

export default function LogsPage() {
  // "" = Tümü: tüm olay günlüğü
  const [tab, setTab] = useState<Tab | "">("");
  const ov = useQuery({ queryKey: ["logs-overview"], queryFn: () => api<Overview>("/admin/logs/overview"), refetchInterval: 30_000 });
  const qc = useQueryClient();
  const o = ov.data;
  if (ov.isError) return <Alert tone="error">{ov.error.message}</Alert>;
  if (!o) return <Spinner />;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Şu an çevrimiçi" value={o.online} icon={CircleUserRound} delta={`son ${o.onlineWindowMinutes} dk içinde`} tone="flat" hint="30 sn'de bir yenilenir" />
        <StatCard label="Bugün aktif" value={o.activeToday} icon={Users} delta={`${o.active7d} kişi son 7 günde`} tone="flat" />
        <StatCard label="Giriş (24 saat)" value={o.logins24h} icon={LogIn} delta={`${o.openSessions} açık oturum`} tone="flat" />
        <StatCard
          label="Hatalı giriş (24 saat)"
          value={o.failed24h}
          icon={ShieldAlert}
          delta={o.failed24h > 5 ? "olağandışı yüksek" : "normal seviyede"}
          tone={o.failed24h > 5 ? "down" : "up"}
          hint={`${o.events24h} olay · ${o.listingEvents24h} ilan olayı`}
        />
      </div>

      <Panel
        title="Son 24 saat"
        subtitle="Saatlik giriş ve toplam olay sayısı"
        actions={
          <button
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ["logs-overview"] });
              void qc.invalidateQueries({ queryKey: ["logs-list"] });
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink hover:border-ink-soft"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Yenile
          </button>
        }
      >
        <LineChart
          height={170}
          labels={o.hourly.map((h) => new Date(h.hour).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }))}
          series={[
            { name: "Olay", values: o.hourly.map((h) => h.events), tone: "brand" },
            { name: "Giriş", values: o.hourly.map((h) => h.logins), tone: "ink" },
          ]}
        />
      </Panel>

      <FilterTabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          ["online", `Çevrimiçi (${o.online})`],
          ["today", `Bugün aktif (${o.activeToday})`],
          ["sessions", `Açık oturumlar (${o.openSessions})`],
        ]}
      />
      {tab === "" ? <Events categories={o.categories} /> : tab === "sessions" ? <Sessions /> : <Online scope={tab} />}
    </div>
  );
}

function Events({ categories }: { categories: Overview["categories"] }) {
  const [category, setCategory] = useState("");
  const [range, setRange] = useState<"" | "today" | "7d" | "30d">("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (category) params.set("category", category);
  if (range) params.set("range", range);
  if (q.trim()) params.set("q", q.trim());
  const list = useQuery({
    queryKey: ["logs-list", "events", params.toString()],
    queryFn: () => api<{ items: EventRow[]; total: number }>(`/admin/logs/events?${params}`),
    refetchInterval: 30_000,
  });
  const reset = () => setOffset(0);

  return (
    <TablePanel
      toolbar={
        <>
          <SearchBox value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Kullanıcı, telefon, IP veya ilan başlığı" />
          <FilterSelect label="Kategori" value={category} options={categories.map((c) => [c.key, c.label])} onChange={(v) => { setCategory(v); reset(); }} />
          <FilterSelect<"today" | "7d" | "30d">
            label="Zaman"
            value={range}
            options={[["today", "Bugün"], ["7d", "Son 7 gün"], ["30d", "Son 30 gün"]]}
            onChange={(v) => { setRange(v); reset(); }}
          />
        </>
      }
      footer={list.data && <Pagination total={list.data.total} offset={offset} onChange={setOffset} />}
    >
      {!list.data ? (
        <div className="px-6"><Spinner /></div>
      ) : list.data.items.length === 0 ? (
        <p className="p-10 text-center text-ink-soft">Bu filtrede kayıt yok.</p>
      ) : (
        <table className="w-full min-w-[980px]">
          <thead className="border-b border-line bg-paper">
            <tr>
              <th className={th}>Zaman</th>
              <th className={th}>Kullanıcı</th>
              <th className={th}>Olay</th>
              <th className={th}>Hedef / ayrıntı</th>
              <th className={th}>IP</th>
              <th className={th}>Cihaz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.data.items.map((e) => {
              const tone = actionTone(e.action);
              const meta = e.metadata ?? {};
              const detail =
                e.targetLabel ??
                (typeof meta.title === "string" ? meta.title : null) ??
                (typeof meta.email === "string" ? meta.email : null) ??
                (typeof meta.payer === "string" ? `${meta.payer} · ${(Number(meta.amount) / 100).toLocaleString("tr-TR")} ₺` : null);
              return (
                <tr key={e.id} className="hover:bg-paper/60">
                  <td className={`${td} whitespace-nowrap text-ink-soft`} title={new Date(e.createdAt).toLocaleString("tr-TR")}>
                    {timeAgo(e.createdAt)}
                    <div className="text-[11px]">{new Date(e.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                  </td>
                  <td className={td}>
                    {e.actorId ? (
                      <Link href={`/admin/kullanicilar/${e.actorId}`} className="font-semibold text-ink hover:text-brand">
                        {e.actorName ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-ink-soft">{e.action === "payment.paid" ? "Ödeme sağlayıcısı" : "Bilinmeyen"}</span>
                    )}
                    {e.actorRole && <div className="text-[11px] text-ink-soft">{ROLE[e.actorRole] ?? e.actorRole}</div>}
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
                      <span className="font-semibold text-ink">{ACTION_LABEL[e.action] ?? e.action}</span>
                    </span>
                    {typeof meta.method === "string" && <div className="pl-4 text-[11px] text-ink-soft">{meta.method === "password" ? "E-posta + parola" : "SMS kodu"}</div>}
                  </td>
                  <td className={`${td} max-w-[260px] truncate text-ink-soft`}>
                    {e.targetType === "listing" && e.targetId ? (
                      <Link href={`/ilan/${e.targetId}`} className="hover:text-brand">
                        {detail ?? "İlan"}
                      </Link>
                    ) : (
                      detail ?? "—"
                    )}
                  </td>
                  <td className={`${td} font-mono text-xs text-ink-soft`}>{e.ip ?? "—"}</td>
                  <td className={`${td} text-xs text-ink-soft`}>{deviceLabel(e.userAgent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}

function Online({ scope }: { scope: "online" | "today" }) {
  const [offset, setOffset] = useState(0);
  const list = useQuery({
    queryKey: ["logs-list", scope, offset],
    queryFn: () => api<{ items: OnlineRow[]; total: number }>(`/admin/logs/online?scope=${scope}&limit=${PAGE_SIZE}&offset=${offset}`),
    refetchInterval: 30_000,
  });
  return (
    <TablePanel footer={list.data && <Pagination total={list.data.total} offset={offset} onChange={setOffset} />}>
      {!list.data ? (
        <div className="px-6"><Spinner /></div>
      ) : list.data.items.length === 0 ? (
        <p className="p-10 text-center text-ink-soft">{scope === "online" ? "Şu an çevrimiçi kimse yok." : "Bugün aktif kullanıcı yok."}</p>
      ) : (
        <table className="w-full min-w-[860px]">
          <thead className="border-b border-line bg-paper">
            <tr>
              <th className={th}>Kullanıcı</th>
              <th className={th}>Rol / ofis</th>
              <th className={th}>Son görülme</th>
              <th className={th}>Cihaz</th>
              <th className={th}>IP</th>
              <th className={`${th} text-right`}>Oturum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.data.items.map((u) => (
              <tr key={u.id} className="hover:bg-paper/60">
                <td className={td}>
                  <span className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${u.online ? "bg-ok ring-4 ring-ok-tint" : "bg-line"}`} title={u.online ? "Çevrimiçi" : "Çevrimdışı"} />
                    <span>
                      <Link href={`/admin/kullanicilar/${u.id}`} className="font-semibold text-ink hover:text-brand">
                        {u.fullName ?? "—"}
                      </Link>
                      <span className="block text-[11px] text-ink-soft">{formatPhone(u.phone)}</span>
                    </span>
                  </span>
                </td>
                <td className={`${td} text-ink-soft`}>
                  {u.role ? ROLE[u.role] : "Kayıt yarım"}
                  {u.office && <div className="text-[11px]">{u.office}</div>}
                </td>
                <td className={`${td} whitespace-nowrap`}>{u.online ? <span className="font-semibold text-ok">Çevrimiçi · {timeAgo(u.lastSeenAt)}</span> : timeAgo(u.lastSeenAt)}</td>
                <td className={`${td} text-xs text-ink-soft`}>
                  <span className="inline-flex items-center gap-1.5">
                    <MonitorSmartphone className="h-3.5 w-3.5" /> {deviceLabel(u.userAgent)}
                  </span>
                </td>
                <td className={`${td} font-mono text-xs text-ink-soft`}>{u.ip ?? "—"}</td>
                <td className={`${td} text-right tabular-nums`}>{u.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}

function Sessions() {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["logs-list", "sessions", offset],
    queryFn: () => api<{ items: SessionRow[]; total: number }>(`/admin/logs/sessions?limit=${PAGE_SIZE}&offset=${offset}`),
  });
  async function revoke(id: string) {
    setBusy(id);
    try {
      await api(`/admin/logs/sessions/${id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["logs-list"] });
      await qc.invalidateQueries({ queryKey: ["logs-overview"] });
    } finally {
      setBusy(null);
    }
  }
  return (
    <TablePanel footer={list.data && <Pagination total={list.data.total} offset={offset} onChange={setOffset} />}>
      {!list.data ? (
        <div className="px-6"><Spinner /></div>
      ) : (
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-line bg-paper">
            <tr>
              <th className={th}>Kullanıcı</th>
              <th className={th}>Cihaz</th>
              <th className={th}>IP</th>
              <th className={th}>Açıldı</th>
              <th className={th}>Son kullanım</th>
              <th className={th}>Bitiş</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.data.items.map((s) => (
              <tr key={s.id} className="hover:bg-paper/60">
                <td className={td}>
                  <Link href={`/admin/kullanicilar/${s.userId}`} className="font-semibold text-ink hover:text-brand">
                    {s.fullName ?? "—"}
                  </Link>
                  <div className="text-[11px] text-ink-soft">{s.role ? ROLE[s.role] : ""}</div>
                </td>
                <td className={`${td} text-xs text-ink-soft`}>{deviceLabel(s.userAgent)}</td>
                <td className={`${td} font-mono text-xs text-ink-soft`}>{s.ip ?? "—"}</td>
                <td className={`${td} text-ink-soft`}>{timeAgo(s.createdAt)}</td>
                <td className={td}>{timeAgo(s.lastUsedAt)}</td>
                <td className={`${td} text-ink-soft`}>{new Date(s.expiresAt).toLocaleDateString("tr-TR")}</td>
                <td className={`${td} text-right`}>
                  <button
                    onClick={() => revoke(s.id)}
                    disabled={busy === s.id}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-brand hover:border-brand disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Oturumu kapat
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TablePanel>
  );
}

