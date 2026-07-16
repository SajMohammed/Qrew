const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export interface ScanResult {
  found: boolean;
  applied?: boolean;
  reason?: "applied" | "duplicate" | "cooldown";
  currentStamps?: number;
  stampsRequired?: number;
  rewardReady?: boolean;
}

export async function scan(merchantId: string, serial: string): Promise<ScanResult> {
  const idempotencyKey = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const res = await fetch(`${BASE}/loyalty/scan`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-merchant-id": merchantId },
    body: JSON.stringify({ serial, idempotencyKey }),
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Scan failed (${res.status})`);
  return res.json(); // { found: true, applied, reason, currentStamps, stampsRequired, rewardReady }
}
