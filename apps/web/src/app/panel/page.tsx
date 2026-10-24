"use client";

import Link from "next/link";
import { useMe } from "@/components/app-shell";
import { ConsentsCard } from "@/components/consents-card";
import { SecurityCard } from "@/components/security-card";
import { AvatarCard } from "@/components/avatar-card";
import { Alert, Card, Eyebrow, RoleBadge, StatusBadge } from "@/components/ui";

export default function PanelHome() {
  const { me } = useMe();
  const first = me.fullName?.split(" ")[0] ?? "";

  if (me.role === "consumer") {
    return (
      <div className="max-w-2xl">
        <Eyebrow>Hoş geldin</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Merhaba {first}</h1>
        <Card className="mt-8">
          <p className="text-ink-soft">
            Onaylı danışmanların herkese açık portföylerini akışta görebilir, beğenip
            kaydedebilir ve danışmanları takip edebilirsin.
          </p>
          <Link href="/akis" className="mt-4 inline-flex font-semibold text-brand hover:underline">
            Akışa git →
          </Link>
        </Card>
        <AvatarCard />
        <SecurityCard />
        <ConsentsCard />
      </div>
    );
  }

  const status = me.agent?.verificationStatus ?? "draft";
  const copy = {
    draft: {
      tone: "info" as const,
      title: "Onaylı danışman rozeti için başvurunu tamamla",
      text: "Yetki belgesi bilgilerini ve belgeni yükle. Onaylanan danışmanlar portföy paylaşabilir ve rozetle ayrışır.",
      cta: "Başvuruya devam et",
    },
    pending: {
      tone: "warn" as const,
      title: "Başvurun incelemede",
      text: "Ekibimiz belgelerini kontrol ediyor. Sonuçlandığında sana bildirim göndereceğiz.",
      cta: "Başvuruyu görüntüle",
    },
    rejected: {
      tone: "error" as const,
      title: "Başvurunda düzeltme gerekiyor",
      text: "Ret gerekçesini inceleyip bilgilerini güncelledikten sonra yeniden gönderebilirsin.",
      cta: "Düzelt ve yeniden gönder",
    },
    approved: {
      tone: "ok" as const,
      title: "Onaylı danışmansın",
      text: "Profilinde onay rozeti görünüyor. Portföyünü ekleyip EİDS doğrulamasıyla yayına alabilirsin.",
      cta: "Başvuru detayları",
    },
  }[status];

  return (
    <div className="max-w-3xl">
      <Eyebrow>Genel bakış</Eyebrow>
      <h1 className="text-3xl font-extrabold tracking-tight">Merhaba {first}</h1>

      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Danışman onayı</h2>
          <StatusBadge status={status} />
        </div>
        <div className="mt-5">
          <Alert tone={copy.tone} title={copy.title}>
            {copy.text}
          </Alert>
        </div>
        <Link
          href="/basvuru"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-black"
        >
          {copy.cta}
        </Link>
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Ofis</h2>
          {me.office && <RoleBadge role={me.office.role} />}
        </div>
        {me.office ? (
          <p className="mt-3 text-ink-soft">
            <span className="font-semibold text-ink">{me.office.name}</span>
            {me.office.status === "pending" && " · yönetici incelemesinde"}
          </p>
        ) : (
          <p className="mt-3 text-ink-soft">
            Bağımsız Danışman olarak görünüyorsun. Bir ofise katılabilir veya kendi ofisini açabilirsin.
          </p>
        )}
        <Link
          href="/panel/ofis"
          className="mt-5 inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-ink-soft"
        >
          {me.office ? "Ofisime git" : "Ofis bul veya aç"}
        </Link>
      </Card>
      <AvatarCard />
      <SecurityCard />
      <ConsentsCard />
    </div>
  );
}
