"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderLegalMarkdown } from "./legal-markdown";
import { Spinner } from "./ui";

interface LegalDoc {
  slug: string;
  title: string;
  version: string;
  draft: boolean;
  body: string;
}

const cache = new Map<string, LegalDoc>();

/** Hukuki metni sayfadan ayrılmadan pencere içinde gösterir (giriş/kayıt ekranları). */
export function LegalLink({ slug, children, className }: { slug: "kvkk" | "kosullar" | "ticari-ileti"; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [doc, setDoc] = useState<LegalDoc | null>(cache.get(slug) ?? null);
  const [error, setError] = useState<string | null>(null);

  async function open(e: React.MouseEvent) {
    // Yeni sekmede açma (ctrl/cmd tıklama) tarayıcıya bırakılır
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    ref.current?.showModal();
    if (doc) return;
    try {
      const res = await fetch(`/api/backend/legal/${slug}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as LegalDoc;
      cache.set(slug, d);
      setDoc(d);
    } catch {
      setError("Metin şu anda yüklenemedi. Ayrı sayfada açmayı deneyin.");
    }
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // Arka plana tıklayınca kapan
    const onClick = (ev: MouseEvent) => {
      if (ev.target === d) d.close();
    };
    d.addEventListener("click", onClick);
    return () => d.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <a href={`/${slug}`} onClick={open} className={className}>
        {children}
      </a>
      <dialog
        ref={ref}
        aria-label={doc?.title ?? "Hukuki metin"}
        className="m-auto w-[min(720px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">{doc?.title ?? "Yükleniyor…"}</h2>
              {doc && (
                <p className="text-xs text-ink-soft">
                  Sürüm {doc.version}
                  {doc.draft && " · taslak"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <a
                href={`/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink"
                aria-label="Ayrı sayfada aç"
                title="Ayrı sayfada aç"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>
          <div className="overflow-y-auto px-6 pb-6 leading-relaxed text-ink-soft">
            {error ? <p className="mt-4 text-brand">{error}</p> : doc ? renderLegalMarkdown(doc.body) : <Spinner />}
          </div>
          <footer className="border-t border-line px-6 py-3 text-right">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-black"
            >
              Okudum, kapat
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
