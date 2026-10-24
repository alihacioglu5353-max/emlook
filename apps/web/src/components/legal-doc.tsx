import "server-only";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { API_URL } from "@/lib/server/backend";
import { renderLegalMarkdown } from "./legal-markdown";

export interface LegalDoc {
  slug: string;
  title: string;
  version: string;
  updatedAt: string;
  draft: boolean;
  body: string;
}

/** Hukuki metni API'den istek anında alır (metin API'de tek kaynak). */
export async function fetchLegalDoc(slug: string): Promise<LegalDoc | null> {
  try {
    const res = await fetch(`${API_URL}/legal/${slug}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as LegalDoc;
  } catch {
    throw new Error("Metin şu anda yüklenemedi. Lütfen biraz sonra tekrar deneyin.");
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export async function LegalPage({ slug }: { slug: string }) {
  const doc = await fetchLegalDoc(slug);
  if (!doc) notFound();
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/">
        <Logo className="mb-10" />
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Sürüm {doc.version} · Son güncelleme {formatDate(doc.updatedAt)}
      </p>
      {doc.draft && (
        <div className="mt-6 rounded-xl border border-warn/30 bg-warn-tint p-4 text-sm text-warn">
          Bu metin taslaktır; yayından önce hukuk danışmanı tarafından son hâli verilecektir.
        </div>
      )}
      <article className="mt-4 leading-relaxed text-ink-soft">
        {renderLegalMarkdown(doc.body)}
      </article>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-sm">
        <Link href="/kvkk" className="underline">KVKK Aydınlatma Metni</Link>
        <Link href="/kosullar" className="underline">Kullanım Koşulları</Link>
        <Link href="/ticari-ileti" className="underline">Ticari Elektronik İleti</Link>
      </nav>
    </main>
  );
}
