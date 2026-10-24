"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { SettingsField } from "@/lib/api";

const input =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-soft/60 focus:border-ink focus:outline-none";

/** Tanımdan (alan listesi) form alanı çizer; gizli alanlar "tanımlı · ••••1234" gösterir */
export function SettingsFieldInput({
  field,
  value,
  onChange,
  secretInfo,
}: {
  field: SettingsField;
  value: unknown;
  onChange: (v: unknown) => void;
  secretInfo?: { configured: boolean; hint: string | null };
}) {
  const [show, setShow] = useState(false);
  const id = `f-${field.key}`;
  const label = (
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
      {field.label}
      {field.required && <span className="text-brand"> *</span>}
    </label>
  );
  const hint = field.hint && <p className="mt-1 text-xs text-ink-soft">{field.hint}</p>;

  if (field.type === "boolean") {
    return (
      <label className="flex items-start gap-3 rounded-lg border border-line bg-paper/50 px-3 py-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={value === true}
          onClick={() => onChange(!(value === true))}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${value === true ? "bg-brand" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${value === true ? "left-[18px]" : "left-0.5"}`} />
        </button>
        <span>
          <span className="block text-sm font-semibold text-ink">{field.label}</span>
          {field.hint && <span className="block text-xs text-ink-soft">{field.hint}</span>}
        </span>
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <div>
        {label}
        <select id={id} className={input} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Seçin</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hint}
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <div className="sm:col-span-2">
        {label}
        <textarea id={id} rows={3} className={`${input} h-auto py-2`} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
        {hint}
      </div>
    );
  }
  if (field.type === "secret") {
    const big = field.key === "serviceAccount";
    return (
      <div className={big ? "sm:col-span-2" : ""}>
        {label}
        {big ? (
          <textarea
            id={id}
            rows={4}
            className={`${input} h-auto py-2 font-mono text-xs`}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={secretInfo?.configured ? `Tanımlı (${secretInfo.hint}) — değiştirmek için yapıştırın` : '{"type":"service_account", ...}'}
          />
        ) : (
          <div className="relative">
            <input
              id={id}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              className={`${input} pr-10`}
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={secretInfo?.configured ? `Tanımlı · ${secretInfo.hint} (değiştirmek için yazın)` : "Girilmedi"}
            />
            <button type="button" onClick={() => setShow((x) => !x)} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-ink-soft hover:text-ink" aria-label={show ? "Gizle" : "Göster"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        )}
        <p className="mt-1 text-xs text-ink-soft">
          {secretInfo?.configured ? "Boş bırakırsanız mevcut değer korunur." : "Şifreli saklanır, ekranda bir daha gösterilmez."}
          {field.hint ? ` ${field.hint}` : ""}
        </p>
      </div>
    );
  }
  return (
    <div>
      {label}
      <input
        id={id}
        type={field.type === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        className={input}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
        placeholder={field.placeholder}
      />
      {hint}
    </div>
  );
}
