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

export interface Program {
  id: string;
  name: string;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  active: boolean;
  cardDesign: { brandColor: string; stampIcon: string };
}

export type ProgramPatch = Partial<{
  name: string;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  cardDesign: { brandColor?: string; stampIcon?: string };
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

export interface CustomersParams {
  filter?: CustomerFilter;
  search?: string;
  limit?: number;
  offset?: number;
}
