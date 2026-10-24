import type { Metadata } from "next";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Kullanım Koşulları" };

/** TASLAK: Nihai metin değiştiğinde API'deki TERMS_VERSION güncellenmelidir. */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Logo className="mb-10" />
      <h1 className="text-3xl font-extrabold tracking-tight">Kullanım Koşulları</h1>
      <div className="mt-6 rounded-xl border border-warn/30 bg-warn-tint p-4 text-sm text-warn">
        Bu sayfa yer tutucudur. Yayından önce hukuk danışmanının hazırladığı nihai metin
        eklenecektir.
      </div>
    </main>
  );
}
