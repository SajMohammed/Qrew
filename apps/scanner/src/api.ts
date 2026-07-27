export interface ScanResult {
  found: boolean;
  enrollmentId?: string; // present when found — lets the scanner redeem this exact card
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
