import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import type { VerificationStatus } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/format";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Emlook işareti: çatılı "e" ve kelime markası */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <path
          d="M16 3 L28 12 V16 H8.5 C9.4 21 13 24 17.5 24 C20.5 24 23 22.8 25 21 L28 24.5 C25.4 27 21.6 29 17.3 29 C9.4 29 4 23.2 4 15.6 V12 Z M9 12 H23 L16 6.9 Z"
          fill="var(--brand)"
        />
      </svg>
      <span
        className={cx(
          "text-[1.4rem] font-extrabold tracking-tight",
          light ? "text-surface" : "text-ink",
        )}
      >
        emlook
      </span>
    </span>
  );
}

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand text-white hover:bg-brand-ink",
        variant === "secondary" && "bg-ink text-white hover:bg-black",
        variant === "ghost" && "border border-line bg-surface text-ink hover:border-ink-soft",
        variant === "danger" && "border border-brand text-brand hover:bg-brand-tint",
        className,
      )}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-sm text-brand">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-sm text-ink-soft">{hint}</span>
      ) : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-ink focus:outline-none disabled:bg-paper disabled:text-ink-soft";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputBase, "h-12", props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputBase, "min-h-24 py-3", props.className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface p-6 sm:p-8", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-brand">{children}</p>
  );
}

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const tone = {
    draft: "bg-paper text-ink-soft border-line",
    pending: "bg-warn-tint text-warn border-transparent",
    approved: "bg-ok-tint text-ok border-transparent",
    rejected: "bg-brand-tint text-brand-ink border-transparent",
  }[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        tone,
      )}
    >
      {status === "approved" && <VerifiedIcon className="h-3.5 w-3.5" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M10 1.5l2.1 1.6 2.6-.2.9 2.5 2.2 1.4-.6 2.6.6 2.6-2.2 1.4-.9 2.5-2.6-.2L10 18.5l-2.1-1.6-2.6.2-.9-2.5L2.2 13.2l.6-2.6-.6-2.6 2.2-1.4.9-2.5 2.6.2z"
      />
      <path
        d="M6.5 10.2l2.3 2.3 4.7-4.8"
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "error" | "ok" | "warn";
  title?: string;
  children?: ReactNode;
}) {
  const styles = {
    info: "bg-paper border-line text-ink",
    error: "bg-brand-tint border-transparent text-brand-ink",
    ok: "bg-ok-tint border-transparent text-ok",
    warn: "bg-warn-tint border-transparent text-warn",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border p-4 text-sm", styles)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Yükleniyor" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-ink-soft" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  );
}

/** Ofis içi rol rozeti: Sahip vurgulu, diğerleri sade */
export function RoleBadge({ role }: { role: "owner" | "manager" | "agent" }) {
  const label = { owner: "Sahip", manager: "Yönetici", agent: "Danışman" }[role];
  const tone =
    role === "owner"
      ? "bg-brand text-white"
      : role === "manager"
        ? "bg-ink text-white"
        : "bg-paper text-ink-soft border border-line";
  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold", tone)}>
      {label}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">{children}</p>;
}
