"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/components/app-shell";
import { ListingForm } from "@/components/listing-form";
import { Alert, Eyebrow } from "@/components/ui";
import { api, type ListingDetail } from "@/lib/api";

export default function NewListingPage() {
  const { me } = useMe();
  const router = useRouter();
  const qc = useQueryClient();

  if (!me.agent?.isVerified) {
    return (
      <Alert tone="warn" title="İlan girmek için danışman onayı gerekiyor">
        <Link href="/basvuru" className="font-semibold underline">
          Başvuruna git
        </Link>
      </Alert>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/panel/portfoy" className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← Portföyüm
        </Link>
        <Eyebrow>Yeni ilan</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Portföy ekle</h1>
        <p className="mt-2 text-ink-soft">
          İlan taslak olarak kaydedilir. Sonraki adımda fotoğrafları ekleyip EİDS doğrulamasıyla
          yayına alırsın.
        </p>
      </div>
      <ListingForm
        submitLabel="Kaydet ve fotoğraflara geç"
        onSubmit={async (input) => {
          const created = await api<ListingDetail>("/listings", { json: input });
          qc.setQueryData(["listing", created.id], created);
          void qc.invalidateQueries({ queryKey: ["my-listings"] });
          router.push(`/panel/portfoy/${created.id}`);
        }}
      />
    </div>
  );
}
