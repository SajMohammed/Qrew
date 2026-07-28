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
