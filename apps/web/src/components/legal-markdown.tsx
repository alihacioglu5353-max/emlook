import type { ReactNode } from "react";

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

