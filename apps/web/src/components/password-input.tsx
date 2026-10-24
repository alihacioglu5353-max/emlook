"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "./ui";

/** Parola alanı: göster/gizle düğmesi, Caps Lock uyarısı */
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <div>
      <div className="relative">
        <Input
          {...props}
          type={show ? "text" : "password"}
          className={`pr-12 ${props.className ?? ""}`}
          onKeyUp={(e) => {
            setCaps(e.getModifierState("CapsLock"));
            props.onKeyUp?.(e);
          }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink"
          aria-label={show ? "Parolayı gizle" : "Parolayı göster"}
          aria-pressed={show}
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {caps && <p className="mt-1.5 text-xs font-semibold text-warn">Caps Lock açık</p>}
    </div>
  );
}

/** Parola kuralları: API ile aynı (8+ karakter, harf ve rakam) */
export function passwordChecks(p: string) {
  return [
    { ok: p.length >= 8, label: "En az 8 karakter" },
    { ok: /\p{L}/u.test(p), label: "En az bir harf" },
    { ok: /\d/.test(p), label: "En az bir rakam" },
  ];
}

export function PasswordRules({ value }: { value: string }) {
  const checks = passwordChecks(value);
  const score = checks.filter((c) => c.ok).length + (value.length >= 12 ? 1 : 0) + (/[^\p{L}\d]/u.test(value) ? 1 : 0);
  const level = value ? (score <= 2 ? 0 : score <= 3 ? 1 : score === 4 ? 2 : 3) : -1;
  const labels = ["Zayıf", "Orta", "İyi", "Güçlü"];
  const colors = ["bg-brand", "bg-warn", "bg-ok", "bg-ok"];
  return (
    <div className="mt-2 grid gap-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 rounded-full ${i <= level ? colors[level] : "bg-line"}`} />
          ))}
        </div>
        {level >= 0 && <span className="w-12 text-right text-xs font-semibold text-ink-soft">{labels[level]}</span>}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {checks.map((c) => (
          <li key={c.label} className={`inline-flex items-center gap-1 ${c.ok ? "text-ok" : "text-ink-soft"}`}>
            <Check className={`h-3.5 w-3.5 ${c.ok ? "" : "opacity-30"}`} /> {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
