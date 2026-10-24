"use client";

import { useState } from "react";
import { Button } from "./ui";

/** Yönetim tablolarında sayfa geçişi */
export function Pager({ total, offset, page, onChange }: { total: number; offset: number; page: number; onChange: (o: number) => void }) {
  if (total <= page) return <p className="text-sm text-ink-soft">{total} kayıt</p>;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-soft">
        {offset + 1}–{Math.min(offset + page, total)} / {total}
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" className="!h-9" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - page))}>
          Önceki
        </Button>
        <Button variant="ghost" className="!h-9" disabled={offset + page >= total} onClick={() => onChange(offset + page)}>
          Sonraki
        </Button>
      </div>
    </div>
  );
}

/**
 * Gerekçe isteyen işlem: düğmeye basınca metin alanı açılır, onayla gönderilir.
 */
export function ReasonAction({
  label,
  placeholder,
  confirmLabel,
  busy,
  onSubmit,
  variant = "danger",
  minLength = 5,
}: {
  label: string;
  placeholder: string;
  confirmLabel: string;
  busy?: boolean;
  onSubmit: (reason: string) => Promise<unknown> | void;
  variant?: "danger" | "ghost" | "secondary";
  minLength?: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <Button variant={variant} className="!h-9" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-xl border border-line bg-paper p-3">
      <textarea
        autoFocus
        rows={2}
        maxLength={500}
        placeholder={placeholder}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
      />
      <div className="flex gap-2">
        <Button
          variant={variant === "ghost" ? "secondary" : variant}
          className="!h-9"
          loading={busy}
          disabled={reason.trim().length < minLength}
          onClick={async () => {
            await onSubmit(reason.trim());
            setOpen(false);
            setReason("");
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" className="!h-9" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
