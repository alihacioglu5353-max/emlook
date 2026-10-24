"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CircleCheck,
  FileCheck2,
  Flag,
  Handshake,
  House,
  MessageSquare,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BarChart, Donut, LineChart, Panel, Pill, Progress, Segmented, StatCard } from "@/components/dashboard";
import { Alert, Spinner } from "@/components/ui";
import { api, fileUrl, type AdminCharts, type AdminDashboard } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { CATEGORY_LABEL, formatKurus, formatPrice } from "@/lib/listing";

const num = new Intl.NumberFormat("tr-TR");
const compactTl = (kurus: number) => {
  const tl = kurus / 100;
  if (tl >= 1_000_000) return `${(tl / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} M ₺`;
  if (tl >= 1_000) return `${Math.round(tl / 1_000).toLocaleString("tr-TR")} B ₺`;
  return `${num.format(Math.round(tl))} ₺`;
};
const compactPrice = (tl: number) =>
  tl >= 1_000_000 ? `${(tl / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} M ₺` : `${num.format(tl)} ₺`;
const weekLabel = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { month: "short" });

/** "+%25 geçen haftaya göre" */
function delta(now: number, prev: number): { text: string; tone: "up" | "down" | "flat" } {
  if (now === prev) return { text: "geçen haftayla aynı", tone: "flat" };
  if (prev === 0) return { text: `+${now} bu hafta`, tone: "up" };
  const pct = Math.round(((now - prev) / prev) * 100);
  return { text: `${pct >= 0 ? "+" : "-"}%${Math.abs(pct)} geçen haftaya göre`, tone: pct >= 0 ? "up" : "down" };
}

const ACTIVITY: Record<string, { label: string; icon: LucideIcon; tone: "ok" | "warn" | "brand" | "neutral" }> = {
  "agent.submitted": { label: "danışman onayı için başvurdu", icon: UserPlus, tone: "neutral" },
  "agent.approved": { label: "bir danışman başvurusunu onayladı", icon: BadgeCheck, tone: "ok" },
  "agent.rejected": { label: "bir danışman başvurusunu reddetti", icon: ShieldAlert, tone: "brand" },
  "office.approved": { label: "bir ofisi onayladı", icon: Building2, tone: "ok" },
  "office.rejected": { label: "bir ofisi reddetti", icon: Building2, tone: "brand" },
  "listing.removed": { label: "bir ilanı yayından kaldırdı", icon: TriangleAlert, tone: "brand" },
  "listing.restored": { label: "bir ilanı geri aldı", icon: House, tone: "ok" },
  "listing.eids_verified": { label: "EİDS doğrulamasını onayladı", icon: FileCheck2, tone: "ok" },
  "listing.eids_failed": { label: "EİDS doğrulamasını reddetti", icon: FileCheck2, tone: "brand" },
  "report.dismissed": { label: "bir şikâyeti kapattı", icon: Flag, tone: "neutral" },
  "user.suspended": { label: "bir kullanıcıyı askıya aldı", icon: ShieldAlert, tone: "brand" },
  "user.reactivated": { label: "bir kullanıcıyı yeniden etkinleştirdi", icon: UserCheck, tone: "ok" },
  "payment_request.created": { label: "ödeme talebi oluşturdu", icon: Wallet, tone: "neutral" },
  "payment_request.cancelled": { label: "ödeme talebini iptal etti", icon: Wallet, tone: "warn" },
  "payout_account.updated": { label: "IBAN bilgisini güncelledi", icon: Banknote, tone: "neutral" },
  "user.onboarded": { label: "kaydını tamamladı", icon: UserPlus, tone: "neutral" },
};
const TONE_BG = { ok: "bg-ok-tint text-ok", warn: "bg-warn-tint text-warn", brand: "bg-brand-tint text-brand", neutral: "bg-paper text-ink-soft" };
const FUNNEL: [string, string, "ok" | "warn" | "brand" | "ink"][] = [
  ["approved", "Onaylı", "ok"],
  ["pending", "İncelemede", "warn"],
  ["draft", "Başlamadı", "ink"],
  ["rejected", "Reddedildi", "brand"],
];

type Metric = "listings" | "signups" | "interests" | "messages";

export default function AdminHome() {
  const q = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api<AdminDashboard>("/admin/dashboard") });
  const c = useQuery({ queryKey: ["admin-charts"], queryFn: () => api<AdminCharts>("/admin/dashboard/charts") });
  const [metric, setMetric] = useState<Metric>("listings");
  const d = q.data;
  const ch = c.data;
  if (q.isError || c.isError) return <Alert tone="error">{(q.error ?? c.error)?.message}</Alert>;
  if (!d || !ch) return <Spinner />;

  const thisWeek = ch.weekly.at(-1)!;
  const prev = ch.previousWeek;
  const users7 = d.newUsers7d;
  const todo: { label: string; short: string; n: number; href: string; icon: LucideIcon }[] = [
    { label: "Danışman başvurusu", short: "danışman başvurusu", n: d.pendingVerifications, href: "/admin/basvurular", icon: BadgeCheck },
    { label: "Ofis başvurusu", short: "ofis başvurusu", n: d.pendingOffices, href: "/admin/ofisler", icon: Building2 },
    { label: "Açık şikâyet", short: "açık şikâyet", n: d.openReports, href: "/admin/sikayetler", icon: Flag },
    { label: "EİDS elle doğrulama", short: "EİDS doğrulaması", n: d.pendingEids, href: "/admin/ilanlar?eids=pending", icon: FileCheck2 },
    { label: "Kesilecek fatura", short: "kesilecek fatura", n: d.pendingInvoices, href: "/admin/odemeler", icon: Banknote },
  ];
  const openTodo = todo.filter((t) => t.n > 0);

  const metricSeries: Record<Metric, { name: string; values: number[]; tone: "brand" | "ink" }[]> = {
    listings: [{ name: "Yeni ilan", values: ch.weekly.map((w) => w.listings), tone: "brand" }],
    signups: [
      { name: "Alıcı / mülk sahibi", values: ch.weekly.map((w) => w.consumers), tone: "brand" },
      { name: "Danışman", values: ch.weekly.map((w) => w.agents), tone: "ink" },
    ],
    interests: [{ name: "İlgi (el sıkışma)", values: ch.weekly.map((w) => w.interests), tone: "brand" }],
    messages: [{ name: "Mesaj", values: ch.weekly.map((w) => w.messages), tone: "brand" }],
  };
  const weekTotals = {
    listings: ch.weekly.reduce((a, w) => a + w.listings, 0),
    signups: ch.weekly.reduce((a, w) => a + w.agents + w.consumers, 0),
    interests: ch.weekly.reduce((a, w) => a + w.interests, 0),
    messages: ch.weekly.reduce((a, w) => a + w.messages, 0),
  };
  const sale = ch.deals.find((x) => x.dealType === "sale");
  const rent = ch.deals.find((x) => x.dealType === "rent");
  const funnelTotal = ch.funnel.reduce((a, f) => a + f.count, 0);
  const districtMax = Math.max(1, ...ch.topDistricts.map((x) => x.count));
  const lastMonth = ch.monthly.at(-1)!;

  return (
    <div className="grid gap-6">
      {openTodo.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-warn/25 bg-warn-tint px-5 py-3.5 text-sm text-warn">
          <TriangleAlert className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong className="font-bold">Onay bekleyen işler var: </strong>
            {openTodo.map((t, i) => (
              <span key={t.label}>
                {i > 0 && " · "}
                <Link href={t.href} className="font-semibold underline-offset-2 hover:underline">
                  {t.n} {t.short}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Toplam kullanıcı"
          value={num.format(d.agents + d.consumers)}
          icon={Users}
          {...(() => { const x = delta(users7, prev.users); return { delta: x.text, tone: x.tone }; })()}
          hint={`${users7} yeni (7 gün)`}
        />
        <StatCard
          label="Yayındaki ilan"
          value={num.format(d.activeListings)}
          icon={House}
          {...(() => { const x = delta(d.newListings7d, prev.listings); return { delta: x.text, tone: x.tone }; })()}
          hint={`${d.newListings7d} yeni yayın`}
        />
        <StatCard
          label="Eşleşme"
          value={num.format(d.matches)}
          unit={`/ ${num.format(d.interests)} ilgi`}
          icon={Handshake}
          {...(() => { const x = delta(thisWeek.interests, prev.interests); return { delta: x.text, tone: x.tone }; })()}
        />
        <StatCard
          label="Tahsilat hacmi"
          value={compactTl(d.paidVolume)}
          icon={Wallet}
          delta={`${d.paidPayments} ödeme`}
          tone="flat"
          hint={`Platform geliri ${compactTl(d.platformRevenue)}`}
        />
        <StatCard
          label="Onaylı danışman"
          value={num.format(d.verifiedAgents)}
          unit={`/ ${num.format(d.agents)}`}
          icon={BadgeCheck}
          delta={`${d.pendingVerifications} başvuru bekliyor`}
          tone={d.pendingVerifications > 0 ? "flat" : "up"}
        />
        <StatCard label="Aktif ofis" value={num.format(d.activeOffices)} icon={Building2} delta={`${d.pendingOffices} başvuru bekliyor`} tone="flat" />
        <StatCard
          label="Mesaj (7 gün)"
          value={num.format(d.messages7d)}
          icon={MessageSquare}
          {...(() => { const x = delta(d.messages7d, prev.messages); return { delta: x.text, tone: x.tone }; })()}
        />
        <StatCard
          label="IBAN bekleyen pay"
          value={compactTl(d.heldPayouts)}
          icon={Banknote}
          delta={d.heldPayouts > 0 ? "danışman hesabı eksik" : "bekleyen yok"}
          tone={d.heldPayouts > 0 ? "down" : "up"}
          hint={`${d.suspended} askıda hesap`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel
          title="Platform etkinliği"
          subtitle={`Son 12 hafta · toplam ${num.format(weekTotals[metric])}`}
          actions={
            <Segmented<Metric>
              value={metric}
              onChange={setMetric}
              options={[
                ["listings", "İlan"],
                ["signups", "Kayıt"],
                ["interests", "İlgi"],
                ["messages", "Mesaj"],
              ]}
            />
          }
        >
          <LineChart labels={ch.weekly.map((w) => weekLabel(w.week))} series={metricSeries[metric]} />
          {metricSeries[metric].length > 1 && (
            <div className="mt-3 flex gap-4 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-brand" /> Alıcı / mülk sahibi</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-ink" /> Danışman</span>
            </div>
          )}
        </Panel>
        <Panel title="Portföy dağılımı" subtitle="Yayındaki ilanlar · kategoriye göre">
          <Donut
            slices={ch.categories.map((x) => ({ label: CATEGORY_LABEL[x.category as keyof typeof CATEGORY_LABEL] ?? x.category, value: x.count }))}
            center={num.format(d.activeListings)}
            caption="ilan"
          />
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
            <div>
              <p className="font-bold uppercase tracking-[0.1em] text-ink-soft">Satılık</p>
              <p className="mt-1 text-lg font-extrabold text-ink">{sale?.count ?? 0}</p>
              <p className="text-ink-soft">ort. {compactPrice(sale?.avgPrice ?? 0)}</p>
            </div>
            <div>
              <p className="font-bold uppercase tracking-[0.1em] text-ink-soft">Kiralık</p>
              <p className="mt-1 text-lg font-extrabold text-ink">{rent?.count ?? 0}</p>
              <p className="text-ink-soft">ort. {compactPrice(rent?.avgPrice ?? 0)} / ay</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="Tahsilat"
          subtitle="Son 6 ay · ödenen hizmet bedelleri"
          actions={<Pill tone="brand">{compactTl(lastMonth.revenue)} bu ay gelir</Pill>}
          footer={
            <Link href="/admin/odemeler" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline">
              Ödemelere git <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <BarChart
            data={ch.monthly.map((m) => ({ label: monthLabel(m.month), value: m.volume, sub: `${m.count} ödeme · gelir ${formatKurus(m.revenue)}` }))}
            format={(v) => (v ? compactTl(v) : "–")}
          />
        </Panel>

        <Panel title="Yapılacaklar" subtitle="Yönetici onayı bekleyen işler">
          <ul className="grid gap-1">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-paper">
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${t.n > 0 ? "bg-brand-tint text-brand" : "bg-ok-tint text-ok"}`}>
                    {t.n > 0 ? <t.icon className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-ink">{t.label}</span>
                  {t.n > 0 ? <Pill tone="solid">{t.n}</Pill> : <span className="text-xs text-ink-soft">Temiz</span>}
                  <ArrowRight className="h-4 w-4 text-ink-soft opacity-0 transition group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Danışman onay hunisi" subtitle={`${funnelTotal} danışman profili`}>
          <div className="grid gap-4">
            {FUNNEL.map(([key, label, tone]) => {
              const n = ch.funnel.find((f) => f.status === key)?.count ?? 0;
              return <Progress key={key} label={label} value={n} max={funnelTotal} tone={tone} right={`${n} · %${funnelTotal ? Math.round((n / funnelTotal) * 100) : 0}`} />;
            })}
          </div>
          <Link
            href="/admin/basvurular"
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-bold text-ink shadow-sm hover:border-ink-soft"
          >
            Başvuruları incele <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="İlçelere göre portföy" subtitle="En çok ilan · satılık ortalama fiyat">
          <div className="grid gap-4">
            {ch.topDistricts.map((x, i) => (
              <Progress
                key={x.district}
                label={x.district}
                value={x.count}
                max={districtMax}
                tone={i === 0 ? "brand" : "ink"}
                right={`${x.count} ilan${x.avgSale ? ` · ort. ${compactPrice(x.avgSale)}` : ""}`}
              />
            ))}
          </div>
        </Panel>

        <Panel title="En aktif danışmanlar" subtitle="Yayındaki ilan, beğeni ve eşleşme" padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-paper text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                  <th className="px-6 py-2.5">Danışman</th>
                  <th className="px-3 py-2.5">Ofis</th>
                  <th className="px-3 py-2.5 text-right">İlan</th>
                  <th className="px-3 py-2.5 text-right">Beğeni</th>
                  <th className="px-6 py-2.5 text-right">Eşleşme</th>
                </tr>
              </thead>
              <tbody>
                {ch.topAgents.map((a, i) => (
                  <tr key={a.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="px-6 py-3">
                      <Link href={`/admin/kullanicilar/${a.id}`} className="flex items-center gap-3 font-semibold text-ink hover:text-brand">
                        <span className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${i === 0 ? "bg-brand text-white" : "bg-brand-tint text-brand-ink"}`}>
                          {i + 1}
                        </span>
                        {a.fullName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-soft">{a.office ?? "Bağımsız"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{a.listings}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{a.likes}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{a.matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          title="Son yayınlanan ilanlar"
          subtitle="Moderasyon için hızlı bakış"
          actions={
            <Link href="/admin/ilanlar" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline">
              Tümü <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ch.latest.map((l) => (
              <Link key={l.id} href={`/ilan/${l.id}`} className="group overflow-hidden rounded-lg border border-line bg-surface transition hover:shadow-md">
                <div className="aspect-[4/3] overflow-hidden bg-paper">
                  {l.photoId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fileUrl(`/listings/${l.id}/photos/${l.photoId}`)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-ink-soft"><House className="h-6 w-6" /></div>
                  )}
                </div>
                <div className="grid gap-1 p-3">
                  <p className="truncate text-sm font-semibold text-ink">{l.title}</p>
                  <p className="text-sm font-extrabold text-brand">{formatPrice(l.price, l.dealType as "sale" | "rent")}</p>
                  <p className="truncate text-[11px] text-ink-soft">
                    {l.district} · {l.owner} · {timeAgo(l.publishedAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Son etkinlik" subtitle="Denetim kaydı">
          <ul className="grid gap-4">
            {ch.activity.map((a) => {
              const meta = ACTIVITY[a.action] ?? { label: a.action, icon: CircleCheck, tone: "neutral" as const };
              const Icon = meta.icon;
              return (
                <li key={a.id} className="grid grid-cols-[auto_1fr] items-start gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${TONE_BG[meta.tone]}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-sm text-ink">
                      <strong className="font-semibold">{a.actor ?? "Sistem"}</strong> {meta.label}
                    </span>
                    <span className="text-[11px] text-ink-soft">{timeAgo(a.at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
