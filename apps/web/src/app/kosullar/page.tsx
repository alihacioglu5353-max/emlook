import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-doc";

export const metadata: Metadata = { title: "Kullanım Koşulları" };
/** Metin API'den (GET /legal/kosullar) istek anında okunur; derlemede API gerekmez. */
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalPage slug="kosullar" />;
}
