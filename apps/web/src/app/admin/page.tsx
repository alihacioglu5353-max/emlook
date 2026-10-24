"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Alert, Eyebrow, Spinner } from "@/components/ui";
import { api, type AdminDashboard } from "@/lib/api";
import { formatKurus } from "@/lib/listing";

export default function AdminHome() {
  const q = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api<AdminDashboard>("/admin/dashboard") });
  const d = q.data;
  if (!d) return q.isError ? <Alert tone="error">{q.error.message}</Alert> : <Spinner />;

  const todo: { label: string; n: number; href: string }[] = [
    { label: "Bekleyen danışman başvurusu", n: d.pendingVerifications, href: "/admin/basvurular" },
    { label: "Bekleyen ofis başvurusu", n: d.pendingOffices, href: "/admin/ofisler" },
    { label: "Açık şikâyet", n: d.openReports, href: "/admin/sikayetler" },
    { label: "EİDS elle doğrulama", n: d.pendingEids, href: "/admin/ilanlar?eids=pending" },
  ];

  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: "Kullanıcılar",
      items: [
        ["Danışman", String(d.agents)],
        ["Onaylı danışman", String(d.verifiedAgents)],
        ["Mülk sahibi / alıcı", String(d.consumers)],
        ["Son 7 günde yeni", String(d.newUsers7d)],
        ["Askıda", String(d.suspended)],
        ["Aktif ofis", String(d.activeOffices)],
      ],
    },
    {
      title: "Portföy ve etkileşim",
      items: [
        ["Yayındaki ilan", String(d.activeListings)],
        ["Bunların deneme ilanı", String(d.demoListings)],
        ["Son 7 günde yayın", String(d.newListings7d)],
        ["İlgi (el sıkışma)", String(d.interests)],
        ["Eşleşme", String(d.matches)],
        ["Son 7 günde mesaj", String(d.messages7d)],
      ],
    },
    {
      title: "Ödemeler",
      items: [
        ["Ödenen talep", String(d.paidPayments)],
        ["Tahsil edilen hacim", formatKurus(d.paidVolume)],
        ["Platform geliri", formatKurus(d.platformRevenue)],
        ["IBAN bekleyen pay", formatKurus(d.heldPayouts)],
        ["Kesilecek fatura", String(d.pendingInvoices)],
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Eyebrow>Yönetim</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Özet</h1>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {todo.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`rounded-2xl border p-5 transition hover:border-ink-soft/40 ${
              t.n > 0 ? "border-transparent bg-warn-tint" : "border-line bg-surface"
            }`}
          >
            <p className={`text-3xl font-extrabold tabular-nums ${t.n > 0 ? "text-warn" : ""}`}>{t.n}</p>
            <p className="mt-1 text-sm font-semibold">{t.label}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="font-bold">{g.title}</h2>
            <dl className="mt-3 divide-y divide-line text-sm">
              {g.items.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
