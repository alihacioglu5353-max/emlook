import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-doc";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni" };
/** Metin API'den (GET /legal/kvkk) istek anında okunur; derlemede API gerekmez. */
export const dynamic = "force-dynamic";

export default function KvkkPage() {
  return <LegalPage slug="kvkk" />;
}
