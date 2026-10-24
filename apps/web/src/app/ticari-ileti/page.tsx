import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-doc";

export const metadata: Metadata = { title: "Ticari Elektronik İleti İzni" };
/** Metin API'den (GET /legal/ticari-ileti) istek anında okunur; derlemede API gerekmez. */
export const dynamic = "force-dynamic";

export default function CommercialPage() {
  return <LegalPage slug="ticari-ileti" />;
}
