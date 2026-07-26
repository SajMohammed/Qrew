export interface ScanResult {
  found: boolean;
  applied?: boolean;
  reason?: "applied" | "duplicate" | "cooldown" | "reward_ready";
  currentStamps?: number;
  stampsRequired?: number;
  rewardReady?: boolean;
}
