// Response/request shapes. The fetching lives in useApi.ts (it needs the Clerk token hook).

export interface RecentEnrollment {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  programName: string;
  currentStamps: number;
  stampsRequired: number;
  createdAt: string;
}

export interface Dashboard {
  merchantId: string;
  merchantName: string;
  stats: {
    enrollments: number;
    activeCards: number;
    rewardReady: number;
    stampsIssued: number;
    rewardsRedeemed: number;
  };
  recent: RecentEnrollment[];
}

/**
 * The shop's design INTENT — deliberately platform-agnostic. One design drives the app card, the
 * Google pass, the Apple pass and the printed poster; each surface maps it onto its own template.
 */
export interface CardDesign {
  brandColor: string;
  stampIcon: string;
  /** Public https image, shown on every surface. */
  logoUrl?: string;
  /** Square transparent PNG drawn into the wallet stamp strip. */
  stampImageUrl?: string;
  /** Artwork for a stamp not yet earned; without one the earned artwork is drawn faded. */
  emptyStampImageUrl?: string;
  /** A finished strip the shop drew themselves, used verbatim. Costs them the live stamp count. */
  customStripUrl?: string;
  stampLayout?: "row" | "grid" | "top-heavy" | "diamond";
  stampScale?: number;
  stampGapX?: number;
  stampGapY?: number;
  unearnedOpacity?: number;
  /** Extra rows on the wallet pass. Max 4. */
  details?: { label: string; value: string }[];
  /** Shop location, for the "you're nearby" lock-screen reminder. */
  location?: { lat: number; lng: number; label?: string } | null;
}

export type CardType = "stamp" | "points" | "discount" | "membership";

export interface Program {
  id: string;
  name: string;
  /** Fixed once customers hold passes — a wallet object cannot move between class types. */
  type: CardType;
  /** Settings only this card type has. */
  mechanics: unknown;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  active: boolean;
  cardDesign: CardDesign;
}

export type ProgramPatch = Partial<{
  name: string;
  type: CardType;
  mechanics: unknown;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  cardDesign: Partial<CardDesign>;
}>;

// ── Scan tab (the counter) ────────────────────────────────────────────────────────
export interface ScanResult {
  found: boolean;
  enrollmentId?: string; // present when found — lets us redeem this exact card
  applied?: boolean;
  reason?: "applied" | "duplicate" | "cooldown" | "reward_ready";
  currentStamps?: number;
  stampsRequired?: number;
  rewardReady?: boolean;
}

export interface RedeemResult {
  redeemed: boolean;
  reason: "redeemed" | "insufficient" | "duplicate";
  currentStamps: number;
  rewardText?: string;
}

export interface VerifiedCashier {
  staffToken: string;
  name: string;
  role: string;
}

// ── Analytics + CRM (the owner console) ───────────────────────────────────────────
// Mirrors the interfaces exported by @qrew/core (analytics.ts, customer-list.ts).

export type AnalyticsRange = "7d" | "30d" | "90d";

/** A measure and the same measure over the window immediately before it. */
export interface Kpi {
  value: number;
  previous: number;
}

export interface ActivityItem {
  id: string;
  kind: "stamp" | "redeem" | "join";
  at: string;
  customerName: string | null;
  customerEmail: string | null;
  currentStamps: number | null;
  stampsRequired: number | null;
  rewardText: string | null;
}

export interface TopRegular {
  customerId: string;
  name: string | null;
  email: string | null;
  visits: number;
}

export interface Analytics {
  merchantId: string;
  merchantName: string;
  range: AnalyticsRange;
  customers: Kpi & { total: number };
  stampsIssued: Kpi;
  rewardsRedeemed: Kpi;
  /** Percent (0-100) of visiting customers who came back at least twice. */
  repeatRate: Kpi;
  actions: { rewardReady: number; atRisk: number; atRiskDays: number };
  series: { bucket: "day" | "week"; points: { date: string; stamps: number }[] };
  ladder: { joined: number; returned: number; regulars: number; earnedReward: number };
  activity: ActivityItem[];
  topRegulars: TopRegular[];
}

export type CustomerFilter = "all" | "at_risk" | "reward_ready" | "regulars";
export type CustomerStatus = "reward_ready" | "at_risk" | "regular" | "new" | "active";

export interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  lastVisit: string | null;
  visits: number;
  redemptions: number;
  currentStamps: number | null;
  stampsRequired: number | null;
  rewardReady: boolean;
  status: CustomerStatus;
}

export interface CustomerList {
  rows: CustomerRow[];
  /** Total matching the active filter/search — the basis for paging. */
  total: number;
  limit: number;
  offset: number;
}

// ── Team ──────────────────────────────────────────────────────────────────────────
export interface StaffMember {
  id: string;
  name: string;
  role: string;
  /** Whether a counter PIN is set — i.e. whether they can actually work the till. */
  hasPin: boolean;
  /** True when they sign in with their own account (Clerk) rather than a PIN. */
  linkedAccount: boolean;
  createdAt: string;
}

export interface CustomersParams {
  filter?: CustomerFilter;
  search?: string;
  limit?: number;
  offset?: number;
}
