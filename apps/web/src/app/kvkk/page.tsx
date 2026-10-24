import type { Metadata } from "next";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni" };

/**
 * TASLAK: Hukuk danışmanı tarafından hazırlanacak nihai metinle değiştirilmelidir.
 * Metin değiştiğinde API'deki KVKK_CLARIFICATION_VERSION da güncellenmelidir.
 */
export default function KvkkPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Logo className="mb-10" />
      <h1 className="text-3xl font-extrabold tracking-tight">KVKK Aydınlatma Metni</h1>
      <div className="mt-6 rounded-xl border border-warn/30 bg-warn-tint p-4 text-sm text-warn">
        Bu sayfa yer tutucudur. Yayından önce hukuk danışmanının hazırladığı nihai metin
        eklenecektir.
      </div>
      <div className="mt-6 space-y-4 text-ink-soft">
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu sıfatıyla
          Emlook; kimlik, iletişim, mesleki yetki belgesi ve işlem güvenliği verilerinizi hesap
          oluşturma, danışman doğrulama, hizmetin sunulması ve yasal yükümlülüklerin yerine
          getirilmesi amaçlarıyla işler.
        </p>
        <p>
          Kanun&apos;un 11. maddesindeki haklarınızı kullanmak için bizimle iletişime
          geçebilirsiniz.
        </p>
      </div>
    </main>
  );
}
