import "server-only";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui";
import { API_URL } from "@/lib/server/backend";

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

/** **kalın** satır içi biçimi */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/** Sade markdown: #, ##, ###, -, 1., >, **kalın**, paragraf */
export function renderLegalMarkdown(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = md.split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1
          ? "mt-8 text-2xl font-extrabold"
          : level === 2
            ? "mt-8 text-lg font-bold text-ink"
            : "mt-6 font-semibold text-ink";
      const Tag = (`h${level + 1}`) as "h2" | "h3" | "h4";
      out.push(
        <Tag key={key++} className={cls}>
          {inline(heading[2])}
        </Tag>,
      );
      i++;
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="mt-3 list-disc space-y-1.5 pl-5">
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(
        <ol key={key++} className="mt-3 list-decimal space-y-1.5 pl-5">
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        parts.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote
          key={key++}
          className="mt-4 rounded-xl border border-warn/30 bg-warn-tint p-3 text-sm text-warn"
        >
          {inline(parts.join(" "))}
        </blockquote>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|\s*-\s|\s*\d+\.\s|>)/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(
      <p key={key++} className="mt-3">
        {inline(para.join(" "))}
      </p>,
    );
  }
  return out;
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
