"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMe } from "@/components/app-shell";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  RoleBadge,
  Spinner,
  VerifiedIcon,
} from "@/components/ui";
import { api, type OfficeManage, type OfficePerson } from "@/lib/api";
import { formatDate, formatPhone, timeAgo } from "@/lib/format";
import { useAction } from "@/lib/use-action";

export default function ManageOfficePage() {
  const { me, reload } = useMe();
  const qc = useQueryClient();
  const officeId = me.office?.id;
  const key = ["office-manage", officeId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<OfficeManage>(`/offices/${officeId}/manage`),
    enabled: !!officeId && me.office?.role !== "agent",
  });
  const action = useAction();

  if (!me.office || me.office.role === "agent") {
    return (
      <Alert>
        Ofis panelini yalnızca ofis sahibi ve yöneticiler görebilir.{" "}
        <Link href="/panel/ofis" className="font-semibold underline">
          Ofisim
        </Link>
      </Alert>
    );
  }
  const data = query.data;
  if (!data) {
    return query.isError ? <Alert tone="error">{query.error.message}</Alert> : <Spinner />;
  }

  const isOwner = data.myRole === "owner";
  const base = `/offices/${data.office.id}`;

  async function apply(promise: Promise<OfficeManage>) {
    qc.setQueryData(key, await promise);
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  const run = (k: string, fn: () => Promise<OfficeManage>) => action.run(k, () => apply(fn()));

  /** Yöneticinin bu üyeye yapabilecekleri */
  const canRemove = (p: OfficePerson) =>
    p.role !== "owner" && p.userId !== me.id && (isOwner || p.role === "agent");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/panel/ofis" className="text-sm font-semibold text-ink-soft hover:text-ink">
            ← Ofisim
          </Link>
          <Eyebrow>
            <span className="mt-4 block">Ofis paneli</span>
          </Eyebrow>
          <h1 className="text-3xl font-extrabold tracking-tight">{data.office.name}</h1>
          <p className="mt-1 text-ink-soft">
            {data.office.legalName} · Yetki belgesi {data.office.licenseNumber}
          </p>
        </div>
        <RoleBadge role={data.myRole} />
      </div>

      {action.error && <Alert tone="error">{action.error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* Bekleyen talepler */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Katılma talepleri</h2>
              {data.requests.length > 0 && (
                <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
                  {data.requests.length}
                </span>
              )}
            </div>
            <div className="mt-4">
              {data.requests.length === 0 ? (
                <EmptyState>Bekleyen talep yok.</EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {data.requests.map((r) => (
                    <li key={r.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                      <Person p={r} sub={`Talep · ${timeAgo(r.createdAt)}`} />
                      <Button
                        loading={action.busy === `approve:${r.membershipId}`}
                        onClick={() =>
                          run(`approve:${r.membershipId}`, () =>
                            api(`${base}/requests/${r.membershipId}/approve`, { method: "POST" }),
                          )
                        }
                      >
                        Onayla
                      </Button>
                      <Button
                        variant="ghost"
                        loading={action.busy === `decline:${r.membershipId}`}
                        onClick={() =>
                          run(`decline:${r.membershipId}`, () =>
                            api(`${base}/requests/${r.membershipId}/decline`, { method: "POST" }),
                          )
                        }
                      >
                        Reddet
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Ekip */}
          <Card>
            <h2 className="text-lg font-bold">Ekip · {data.members.length} kişi</h2>
            <ul className="mt-4 divide-y divide-line">
              {data.members.map((p) => (
                <li key={p.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                  <Person p={p} sub={p.decidedAt ? `Katılım ${formatDate(p.decidedAt)}` : undefined} />
                  <RoleBadge role={p.role} />
                  <div className="flex flex-wrap gap-2">
                    {isOwner && p.role !== "owner" && (
                      <button
                        className="text-xs font-semibold text-ink-soft hover:text-ink"
                        onClick={() =>
                          run(`role:${p.userId}`, () =>
                            api(`${base}/members/${p.userId}`, {
                              method: "PATCH",
                              json: { role: p.role === "manager" ? "agent" : "manager" },
                            }),
                          )
                        }
                      >
                        {p.role === "manager" ? "Yöneticiliği kaldır" : "Yönetici yap"}
                      </button>
                    )}
                    {isOwner && p.role !== "owner" && (
                      <button
                        className="text-xs font-semibold text-ink-soft hover:text-ink"
                        onClick={() => {
                          if (
                            !confirm(
                              `Ofis sahipliğini ${p.fullName ?? "bu üyeye"} devretmek istiyor musun? Sen yönetici olarak kalırsın.`,
                            )
                          )
                            return;
                          void action.run(`owner:${p.userId}`, async () => {
                            await apply(api(`${base}/owner/${p.userId}`, { method: "POST" }));
                            await reload();
                          });
                        }}
                      >
                        Sahipliği devret
                      </button>
                    )}
                    {canRemove(p) && (
                      <button
                        className="text-xs font-semibold text-brand hover:text-brand-ink"
                        onClick={() => {
                          if (!confirm(`${p.fullName ?? "Bu üye"} ekipten çıkarılsın mı?`)) return;
                          void run(`remove:${p.userId}`, () =>
                            api(`${base}/members/${p.userId}`, { method: "DELETE" }),
                          );
                        }}
                      >
                        Çıkar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Invite base={base} onDone={apply} />

          {/* Gönderilen davetler */}
          <Card>
            <h2 className="text-lg font-bold">Bekleyen davetler</h2>
            <div className="mt-4">
              {data.invitations.length === 0 ? (
                <EmptyState>Bekleyen davet yok.</EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {data.invitations.map((i) => (
                    <li key={i.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                      <Person p={i} sub={`Davet · ${timeAgo(i.createdAt)}`} />
                      <button
                        className="text-xs font-semibold text-ink-soft hover:text-brand"
                        onClick={() =>
                          run(`cancel:${i.membershipId}`, () =>
                            api(`${base}/invitations/${i.membershipId}`, { method: "DELETE" }),
                          )
                        }
                      >
                        Geri çek
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <OfficeInfo data={data} onSaved={apply} />
        </div>
      </div>
    </div>
  );
}

function Person({ p, sub }: { p: OfficePerson; sub?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 font-semibold">
        {p.fullName ?? "—"}
        {p.isVerified && <VerifiedIcon className="h-4 w-4 text-[#2f7de1]" />}
      </p>
      <p className="text-sm text-ink-soft">
        {formatPhone(p.phone)}
        {sub && <> · {sub}</>}
      </p>
    </div>
  );
}

function Invite({ base, onDone }: { base: string; onDone: (p: Promise<OfficeManage>) => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const action = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSent(false);
    const ok = await action.run("invite", async () => {
      await onDone(api<OfficeManage>(`${base}/invitations`, { json: { phone } }));
      return true;
    });
    if (ok) {
      setPhone("");
      setSent(true);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">Ekibe davet et</h2>
      <p className="mt-1 text-sm text-ink-soft">Onaylı danışmanları cep telefonu numarasıyla davet et.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Input
          type="tel"
          placeholder="05XX XXX XX XX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="Davet edilecek telefon"
          required
        />
        <Button type="submit" variant="secondary" loading={action.busy === "invite"} className="w-full">
          Davet gönder
        </Button>
      </form>
      {action.error && (
        <div className="mt-3">
          <Alert tone="error">{action.error}</Alert>
        </div>
      )}
      {sent && <p className="mt-3 text-sm text-ok">Davet gönderildi.</p>}
    </Card>
  );
}

function OfficeInfo({
  data,
  onSaved,
}: {
  data: OfficeManage;
  onSaved: (p: Promise<OfficeManage>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: data.office.name,
    address: data.office.address ?? "",
    phone: data.office.phone ?? "",
    email: data.office.email ?? "",
  });
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, string> = { name: form.name, address: form.address };
    if (form.phone.trim()) body.phone = form.phone;
    if (form.email.trim()) body.email = form.email;
    const ok = await action.run("save", async () => {
      await onSaved(api<OfficeManage>(`/offices/${data.office.id}`, { method: "PATCH", json: body }));
      return true;
    });
    if (ok) setSaved(true);
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">Ofis bilgileri</h2>
      <p className="mt-1 text-sm text-ink-soft">Unvan ve yetki belgesi numarası destek ekibi aracılığıyla değiştirilir.</p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Ofis adı">
          <Input value={form.name} onChange={set("name")} required minLength={2} maxLength={80} />
        </Field>
        <Field label="Adres">
          <Input value={form.address} onChange={set("address")} maxLength={300} />
        </Field>
        <Field label="Telefon">
          <Input type="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="E-posta">
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        {action.error && <Alert tone="error">{action.error}</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" loading={action.busy === "save"}>
            Kaydet
          </Button>
          {saved && <span className="text-sm text-ok">Kaydedildi</span>}
        </div>
      </form>
    </Card>
  );
}
