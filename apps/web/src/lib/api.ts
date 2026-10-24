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
  office: { id: string; name: string; role: OfficeRole; status: OfficeStatus } | null;
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

// ---- E2 · Ofis ----

export type OfficeRole = "owner" | "manager" | "agent";
export type OfficeStatus = "pending" | "active" | "rejected" | "suspended";

export interface OfficeRef {
  id: string;
  name: string;
  city: string;
  district: string;
  status: OfficeStatus;
  rejectionReason?: string | null;
}

export interface MyOffice {
  membership: { membershipId: string; role: OfficeRole; office: OfficeRef } | null;
  independent: boolean;
  requests: { membershipId: string; office: OfficeRef; createdAt: string }[];
  invitations: { membershipId: string; office: OfficeRef; createdAt: string }[];
}

export interface OfficeSearchItem {
  id: string;
  name: string;
  city: string;
  district: string;
  memberCount: number;
}

export interface OfficePerson {
  membershipId: string;
  userId: string;
  fullName: string | null;
  phone: string;
  role: OfficeRole;
  isVerified: boolean;
  createdAt: string;
  decidedAt: string | null;
}

export interface OfficeManage {
  myRole: OfficeRole;
  office: OfficeRef & {
    legalName: string;
    licenseNumber: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  members: OfficePerson[];
  requests: OfficePerson[];
  invitations: OfficePerson[];
}

export interface AdminOfficeItem {
  id: string;
  name: string;
  legalName: string;
  licenseNumber: string;
  city: string;
  district: string;
  status: OfficeStatus;
  createdAt: string;
  reviewedAt: string | null;
  owner: { id: string; fullName: string | null; phone: string };
}

export interface AdminOfficeDetail {
  id: string;
  name: string;
  legalName: string;
  licenseNumber: string;
  city: string;
  district: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: OfficeStatus;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  memberCount: number;
  owner: {
    id: string;
    fullName: string | null;
    phone: string;
    email: string | null;
    verificationStatus: VerificationStatus | null;
    licenseNumber: string | null;
    businessName: string | null;
    licenseMatches: boolean;
  };
}

// ---- Bildirimler ----

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

// ---- E3 · Portföy ----

export type DealType = "sale" | "rent";
export type ListingCategory =
  | "apartment"
  | "residence"
  | "villa"
  | "detached_house"
  | "land"
  | "shop"
  | "office"
  | "warehouse"
  | "building"
  | "other";
export type ListingVisibility = "public" | "network" | "agents";
export type ListingStatus = "draft" | "active" | "passive" | "sold" | "removed";
export type EidsStatus = "unverified" | "pending" | "verified" | "failed";

export interface City {
  code: string;
  name: string;
}
export interface NamedId {
  id: number;
  name: string;
}

export interface ListingCard {
  id: string;
  dealType: DealType;
  category: ListingCategory;
  title: string;
  price: number;
  grossM2: number | null;
  netM2: number | null;
  rooms: string | null;
  cobrokeShare: number | null;
  visibility: ListingVisibility;
  status: ListingStatus;
  isDemo: boolean;
  eidsVerified: boolean;
  publishedAt: string | null;
  createdAt: string;
  location: { city: string; district: string; neighbourhood: string | null };
  owner: { id: string; fullName: string | null; isVerified: boolean; officeName: string | null };
  coverPhoto: string | null;
  photoCount: number;
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
}

export interface MyListings {
  items: ListingCard[];
  counts: Record<ListingStatus | DealType, number>;
}

export interface ListingDetail {
  id: string;
  dealType: DealType;
  category: ListingCategory;
  categoryLabel: string;
  title: string;
  description: string | null;
  price: number;
  grossM2: number | null;
  netM2: number | null;
  rooms: string | null;
  floor: string | null;
  buildingAge: number | null;
  cityCode: string;
  districtId: number;
  neighbourhoodId: number | null;
  location: { city: string; district: string; neighbourhood: string | null };
  cobrokeShare: number | null;
  visibility: ListingVisibility;
  status: ListingStatus;
  isDemo: boolean;
  publishedAt: string | null;
  updatedAt: string;
  eids: {
    verified: boolean;
    status?: EidsStatus;
    propertyNumber?: string | null;
    message?: string | null;
    checkedAt?: string | null;
  };
  photos: { id: string; url: string }[];
  owner: {
    id: string;
    fullName: string | null;
    isVerified: boolean;
    office: { id: string; name: string } | null;
  };
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  isOwner: boolean;
  removedReason?: string | null;
}

export interface ListingInput {
  dealType: DealType;
  category: ListingCategory;
  title: string;
  description?: string | null;
  price: number;
  grossM2?: number | null;
  netM2?: number | null;
  rooms?: string | null;
  floor?: string | null;
  buildingAge?: number | null;
  cityCode: string;
  districtId: number;
  neighbourhoodId?: number | null;
  cobrokeShare: number;
  visibility: ListingVisibility;
  isDemo: boolean;
  propertyNumber?: string;
}

// ---- E4 · Akış ----

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Reaction {
  listingId: string;
  likeCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
}

export interface FollowState {
  agentId: string;
  followerCount: number;
  followedByMe: boolean;
}

export interface PersonCard {
  id: string;
  fullName: string | null;
  isAgent: boolean;
  isVerified: boolean;
  businessName: string | null;
  city: string | null;
  district: string | null;
  officeName: string | null;
  followerCount: number;
  activeListingCount: number;
  followedByMe: boolean;
}

export interface AgentProfileCard {
  id: string;
  fullName: string | null;
  businessName: string | null;
  city: string | null;
  district: string | null;
  bio: string | null;
  isVerified: boolean;
  office: { id: string; name: string; role: OfficeRole } | null;
  independent: boolean;
  followerCount: number;
  followingCount: number;
  activeListingCount: number;
  followedByMe: boolean;
}

// ---- E5 · Keşfet ----

export interface DiscoverResponse {
  items: ListingCard[];
  canUndo: boolean;
}

export type InterestStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface InterestItem {
  id: string;
  status: InterestStatus;
  note: string | null;
  fromDiscover: boolean;
  createdAt: string;
  decidedAt: string | null;
  listing: {
    id: string;
    title: string;
    dealType: DealType;
    price: number;
    status: ListingStatus;
    location: { city: string; district: string };
    coverPhoto: string | null;
  };
  requester: { id: string; fullName: string | null; isAgent: boolean; isVerified: boolean };
  owner: { id: string; fullName: string | null };
  conversationId: string | null;
}

export interface InterestList {
  items: InterestItem[];
  counts: Record<InterestStatus, number>;
}

// ---- E6 · Arama ----

export interface SearchResult {
  parsed: {
    dealType: DealType | null;
    category: ListingCategory | null;
    rooms: string | null;
    minPrice: number | null;
    maxPrice: number | null;
    minM2: number | null;
    maxM2: number | null;
    city: { code: string; name: string } | null;
    district: { id: number; name: string; cityCode: string } | null;
    text: string[];
  };
  total: number;
  items: ListingCard[];
  nextOffset: number | null;
}

// ---- E7 · Mesajlaşma ----

export interface ConversationSummary {
  id: string;
  other: { id: string; fullName: string | null; isAgent: boolean; isVerified: boolean; officeName: string | null };
  lastMessage: { body: string; kind: MessageKind; mine: boolean; createdAt: string } | null;
  unread: number;
  lastMessageAt: string | null;
}

export type MessageKind = "text" | "listing" | "system";

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  body: string;
  senderId: string | null;
  mine: boolean;
  createdAt: string;
  cursor: string;
  listing: {
    id: string;
    title: string;
    price: number;
    dealType: DealType;
    status: ListingStatus;
    coverPhoto: string | null;
  } | null;
}

export interface MessagePage {
  items: ChatMessage[];
  nextCursor: string | null;
}

// ---- E8 · Ödeme ----

export type PaymentStatus = "open" | "paid" | "cancelled" | "expired" | "refunded";

export interface PayoutAccount {
  holderName: string;
  iban: string;
  taxIdLast4: string;
  status: "pending" | "verified" | "rejected";
  updatedAt: string;
}

export interface PaymentRequestView {
  id: string;
  role: "seller" | "buyer";
  status: PaymentStatus;
  amount: number;
  currency: string;
  description: string;
  payer: { name: string; phone?: string | null; email?: string | null };
  listing: { id: string; title: string } | null;
  seller: { id: string; fullName: string | null };
  buyerAgent: { id: string; fullName: string | null } | null;
  buyerShare: number;
  breakdown: { platformFee: number; seller: number; buyer: number; platformFeeBps: number };
  myShare: number;
  payouts: { kind: "platform" | "seller_agent" | "buyer_agent"; amount: number; payoutStatus: "pending" | "settled" | "held" | "failed" }[];
  link: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentSummary {
  settled: number;
  pending: number;
  held: number;
  openRequests: number;
  platformFeeBps: number;
}

export interface PublicPayment {
  status: PaymentStatus;
  amount: number;
  currency: string;
  description: string;
  payerName: string;
  expiresAt: string;
  paidAt: string | null;
  payee: { fullName: string; isVerified: boolean; officeName: string | null };
  provider: string;
}
