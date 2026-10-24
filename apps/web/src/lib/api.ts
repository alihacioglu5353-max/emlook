/**
 * Tarayıcı tarafı API yardımcısı. Tüm çağrılar Next.js köprüsünden geçer;
 * belirteçler çerezde, JavaScript'in erişemediği yerde durur.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const raw = data?.message;
    const message = Array.isArray(raw)
      ? raw.join(" · ")
      : typeof raw === "string"
        ? raw
        : "Bir şeyler ters gitti, tekrar deneyin";
    if (res.status === 401 && typeof window !== "undefined") {
      // Oturum yenilenemedi: tam sayfa yönlendirme önbelleği de temizler.
      const back = encodeURIComponent(window.location.pathname);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/giris?donus=${back}`;
    }
    throw new ApiError(res.status, message, data?.code, data);
  }
  return data as T;
}

export async function api<T>(
  path: string,
  init: { method?: string; json?: unknown; form?: FormData } = {},
): Promise<T> {
  const res = await fetch(path.startsWith("/api/") ? path : `/api/backend${path}`, {
    method: init.method ?? (init.json || init.form ? "POST" : "GET"),
    headers: init.json !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    cache: "no-store",
  });
  return parse<T>(res);
}

/** Belge dosyasına köprü üzerinden giden adres (iframe/img için). */
export const fileUrl = (path: string) => `/api/backend${path}`;

// ---- API türleri ----

export type Role = "agent" | "consumer" | "admin";
export type VerificationStatus = "draft" | "pending" | "approved" | "rejected";

export interface Me {
  id: string;
  phone: string;
  email: string | null;
  fullName: string | null;
  role: Role | null;
  onboardingRequired: boolean;
  agent: { verificationStatus: VerificationStatus; isVerified: boolean } | null;
  consents: { type: string; version: string; granted: boolean; at: string }[];
}

export interface VerificationDoc {
  id: string;
  type: "authority_certificate" | "identity" | "other";
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Verification {
  status: VerificationStatus;
  isVerified: boolean;
  profile: {
    licenseNumber: string | null;
    businessName: string | null;
    city: string | null;
    district: string | null;
    bio: string | null;
  };
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  documents: VerificationDoc[];
  missing: string[];
}

export interface AdminListItem {
  userId: string;
  fullName: string | null;
  phone: string;
  businessName: string | null;
  licenseNumber: string | null;
  city: string | null;
  district: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface AdminDetail extends Verification {
  user: {
    userId: string;
    fullName: string | null;
    phone: string;
    email: string | null;
    createdAt: string;
  };
}
