"use client";

import Link from "next/link";
import { useMe } from "@/components/app-shell";
import { Alert, Card } from "@/components/ui";
import { api, type Me } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAction } from "@/lib/use-action";

/** Rıza durumu: ticari ileti izni değiştirilebilir, diğerleri bilgi amaçlı. */
export function ConsentsCard() {
  const { me, reload } = useMe();
  const { run, busy, error } = useAction();
  const marketing = me.consents.find((c) => c.type === "marketing");
  const granted = marketing?.granted ?? false;

  const toggle = (next: boolean) =>
    run("marketing", async () => {
      await api<Me>("/me/consents/marketing", { method: "PUT", json: { granted: next } });
      await reload();
    });

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-bold">İzinler ve hukuki metinler</h2>
      <label className="mt-4 flex items-start gap-3 text-sm text-ink-soft">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
          checked={granted}
          disabled={busy === "marketing"}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          <span className="font-semibold text-ink">Ticari elektronik ileti</span> — kampanya ve
          duyuruları SMS, e-posta ve bildirim ile almak istiyorum.
          {marketing && (
            <span className="block text-xs">
              Son değişiklik: {formatDate(marketing.at)}
            </span>
          )}
        </span>
      </label>
      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-4 text-sm">
        <Link href="/kvkk" target="_blank" className="underline">KVKK Aydınlatma Metni</Link>
        <Link href="/kosullar" target="_blank" className="underline">Kullanım Koşulları</Link>
        <Link href="/ticari-ileti" target="_blank" className="underline">Ticari İleti Metni</Link>
      </div>
    </Card>
  );
}
