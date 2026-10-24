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
} from "@/components/ui";
import { api, type MyOffice, type OfficeSearchItem } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useAction } from "@/lib/use-action";

const MY_OFFICE_KEY = ["my-office"] as const;

export default function MyOfficePage() {
  const { me, reload } = useMe();
  const qc = useQueryClient();
  const verified = me.agent?.isVerified ?? false;
  const query = useQuery({
    queryKey: MY_OFFICE_KEY,
    queryFn: () => api<MyOffice>("/me/office"),
    enabled: me.role === "agent",
  });
  const action = useAction();

  if (me.role !== "agent") return <Alert>Bu sayfa emlak danışmanları içindir.</Alert>;
  const data = query.data;
  if (!data) {
    return query.isError ? <Alert tone="error">{query.error.message}</Alert> : <Spinner />;
  }

  /** İşlem sonrası güncel durumu önbelleğe yazar; üst çubuktaki bilgiyi tazeler. */
  async function apply(promise: Promise<MyOffice>) {
    const next = await promise;
    qc.setQueryData(MY_OFFICE_KEY, next);
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    await reload();
  }

  const m = data.membership;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Eyebrow>Ofis</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Ofisim</h1>
        <p className="mt-2 text-ink-soft">
          Bir ofise katıl ya da kendi ofisini aç. Ofisi olmayan danışmanlar Bağımsız Danışman
          olarak görünür.
        </p>
      </div>

      {!verified && (
        <Alert tone="warn" title="Önce danışman onayı gerekiyor">
          Ofis açmak veya bir ofise katılmak için onaylı danışman olmalısın.{" "}
          <Link href="/basvuru" className="font-semibold underline">
            Başvuruna git
          </Link>
        </Alert>
      )}

      {action.error && <Alert tone="error">{action.error}</Alert>}

      {data.invitations.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold">Gelen davetler</h2>
          {m && (
            <p className="mt-1 text-sm text-ink-soft">
              Bir daveti kabul edersen {m.office.name} ofisinden ayrılıp yeni ofise geçersin.
            </p>
          )}
          <ul className="mt-4 divide-y divide-line">
            {data.invitations.map((inv) => (
              <li key={inv.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{inv.office.name}</p>
                  <p className="text-sm text-ink-soft">
                    {inv.office.district}, {inv.office.city} · {timeAgo(inv.createdAt)}
                  </p>
                </div>
                <Button
                  loading={action.busy === `accept:${inv.membershipId}`}
                  disabled={!verified}
                  onClick={() =>
                    action.run(`accept:${inv.membershipId}`, () =>
                      apply(api(`/me/office/invitations/${inv.membershipId}/accept`, { method: "POST" })),
                    )
                  }
                >
                  Kabul et
                </Button>
                <Button
                  variant="ghost"
                  loading={action.busy === `decline:${inv.membershipId}`}
                  onClick={() =>
                    action.run(`decline:${inv.membershipId}`, () =>
                      apply(api(`/me/office/invitations/${inv.membershipId}/decline`, { method: "POST" })),
                    )
                  }
                >
                  Reddet
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {m ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">{m.office.name}</h2>
                <RoleBadge role={m.role} />
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {m.office.district}, {m.office.city}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.role !== "agent" && m.office.status === "active" && (
                <Link
                  href="/panel/ofis/yonet"
                  className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-black"
                >
                  Ofis paneli
                </Link>
              )}
              {m.role !== "owner" && (
                <Button
                  variant="danger"
                  loading={action.busy === "leave"}
                  onClick={() => {
                    if (!confirm(`${m.office.name} ofisinden ayrılmak istediğine emin misin?`)) return;
                    void action.run("leave", () => apply(api("/me/office/leave", { method: "POST" })));
                  }}
                >
                  Ofisten ayrıl
                </Button>
              )}
            </div>
          </div>
          {m.office.status === "pending" && (
            <div className="mt-5">
              <Alert tone="warn" title="Ofisin yönetici incelemesinde">
                Onaylandığında bildirim alacaksın; ardından ekibini davet edebilirsin.
              </Alert>
            </div>
          )}
          {m.role === "owner" && m.office.status === "active" && (
            <p className="mt-4 text-sm text-ink-soft">
              Ofis sahibi olarak ayrılmak için önce sahipliği ofis panelinden bir üyeye devretmelisin.
            </p>
          )}
        </Card>
      ) : (
        <>
          <Card className="bg-paper">
            <p className="font-semibold">Şu an Bağımsız Danışman olarak görünüyorsun.</p>
            <p className="mt-1 text-sm text-ink-soft">
              Ofisine katılma talebi gönderebilir veya ofis sahibiysen ofisini açabilirsin.
            </p>
          </Card>
          <OfficeSearch
            disabled={!verified}
            pendingIds={data.requests.map((r) => r.office.id)}
            onRequest={(id) =>
              action.run(`join:${id}`, () =>
                apply(api(`/offices/${id}/join-requests`, { method: "POST" })),
              )
            }
            busy={action.busy}
          />
        </>
      )}

      {data.requests.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold">Bekleyen taleplerim</h2>
          <ul className="mt-4 divide-y divide-line">
            {data.requests.map((r) => (
              <li key={r.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.office.name}</p>
                  <p className="text-sm text-ink-soft">Gönderildi · {timeAgo(r.createdAt)}</p>
                </div>
                <Button
                  variant="ghost"
                  loading={action.busy === `cancel:${r.membershipId}`}
                  onClick={() =>
                    action.run(`cancel:${r.membershipId}`, () =>
                      apply(api(`/me/office/requests/${r.membershipId}`, { method: "DELETE" })),
                    )
                  }
                >
                  Geri çek
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {m && m.role !== "owner" && (
        <OfficeSearch
          title="Başka bir ofise geç"
          hint="Yeni ofis talebini onaylarsa mevcut ofisinden ayrılmış sayılırsın."
          disabled={!verified}
          pendingIds={[m.office.id, ...data.requests.map((r) => r.office.id)]}
          onRequest={(id) =>
            action.run(`join:${id}`, () => apply(api(`/offices/${id}/join-requests`, { method: "POST" })))
          }
          busy={action.busy}
        />
      )}

      {!m && verified && <CreateOffice onCreated={apply} />}
    </div>
  );
}

function OfficeSearch({
  title = "Ofisini bul",
  hint,
  disabled,
  pendingIds,
  onRequest,
  busy,
}: {
  title?: string;
  hint?: string;
  disabled: boolean;
  pendingIds: string[];
  onRequest: (officeId: string) => void;
  busy: string | null;
}) {
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  const results = useQuery({
    queryKey: ["office-search", submitted],
    queryFn: () => api<OfficeSearchItem[]>(`/offices?q=${encodeURIComponent(submitted)}`),
    enabled: submitted.length >= 2,
  });

  return (
    <Card>
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(term.trim());
        }}
      >
        <Input
          placeholder="Ofis adı veya unvan"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Ofis ara"
        />
        <Button type="submit" variant="secondary" disabled={term.trim().length < 2}>
          Ara
        </Button>
      </form>
      <div className="mt-4">
        {submitted.length < 2 ? null : results.isLoading ? (
          <Spinner label="Aranıyor" />
        ) : results.data?.length ? (
          <ul className="divide-y divide-line">
            {results.data.map((o) => {
              const pending = pendingIds.includes(o.id);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{o.name}</p>
                    <p className="text-sm text-ink-soft">
                      {o.district}, {o.city} · {o.memberCount} danışman
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={disabled || pending}
                    loading={busy === `join:${o.id}`}
                    onClick={() => onRequest(o.id)}
                  >
                    {pending ? "Talep gönderildi" : "Katılma talebi gönder"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>&ldquo;{submitted}&rdquo; ile eşleşen aktif bir ofis bulunamadı.</EmptyState>
        )}
      </div>
    </Card>
  );
}

function CreateOffice({ onCreated }: { onCreated: (p: Promise<MyOffice>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    licenseNumber: "",
    city: "",
    district: "",
    address: "",
    phone: "",
    email: "",
  });
  const action = useAction();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
    await action.run("create", () => onCreated(api<MyOffice>("/offices", { json: body })));
  }

  if (!open) {
    return (
      <Card>
        <h2 className="text-lg font-bold">Ofis sahibi misin?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Ofisini aç, ekibini davet et; ofisler arası portföy akışını tek yerden yönet.
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => setOpen(true)}>
          Ofis aç
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">Ofis aç</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Bilgiler yetki belgesiyle eşleşmeli. Ofis, Emlook ekibi onayladıktan sonra yayına girer.
      </p>
      <form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Ofis adı" hint="Platformda görünecek ad">
          <Input value={form.name} onChange={set("name")} required minLength={2} maxLength={80} />
        </Field>
        <Field label="Ticari unvan" hint="Yetki belgesindeki unvan">
          <Input value={form.legalName} onChange={set("legalName")} required minLength={2} />
        </Field>
        <Field label="Yetki belgesi numarası">
          <Input value={form.licenseNumber} onChange={set("licenseNumber")} required minLength={3} />
        </Field>
        <Field label="Telefon">
          <Input type="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="İl">
          <Input value={form.city} onChange={set("city")} required minLength={2} />
        </Field>
        <Field label="İlçe">
          <Input value={form.district} onChange={set("district")} required minLength={2} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Adres">
            <Input value={form.address} onChange={set("address")} maxLength={300} />
          </Field>
        </div>
        <Field label="E-posta">
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        {action.error && (
          <div className="sm:col-span-2">
            <Alert tone="error">{action.error}</Alert>
          </div>
        )}
        <div className="flex gap-3 sm:col-span-2">
          <Button type="submit" loading={action.busy === "create"}>
            Ofisi incelemeye gönder
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
        </div>
      </form>
    </Card>
  );
}
