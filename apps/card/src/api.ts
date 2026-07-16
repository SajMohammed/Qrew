const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export interface CardView {
  serial: string;
  qrToken: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  bonusStamps: number;
  rewardReady: boolean;
  wallet: { apple: string | null; google: string | null };
}

export interface EnrollResult {
  enrollmentId: string;
  serial: string;
  currentStamps: number;
  alreadyEnrolled: boolean;
}

function rnd(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enroll(input: {
  merchantId: string;
  programId: string;
  phone?: string;
  name?: string;
}): Promise<EnrollResult> {
  const res = await fetch(`${BASE}/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Enroll failed (${res.status})`);
  return res.json();
}

export async function getCard(serial: string): Promise<CardView> {
  const res = await fetch(`${BASE}/card/${serial}`);
  if (!res.ok) throw new Error(`Card not found (${res.status})`);
  return res.json();
}

// DEV: stands in for the staff scanner until we build it.
export async function simulateStamp(merchantId: string, enrollmentId: string): Promise<void> {
  const res = await fetch(`${BASE}/loyalty/stamp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-merchant-id": merchantId },
    body: JSON.stringify({ enrollmentId, idempotencyKey: `sim-${rnd()}` }),
  });
  if (!res.ok) throw new Error(`Stamp failed (${res.status})`);
}

export async function redeemReward(merchantId: string, enrollmentId: string): Promise<void> {
  const res = await fetch(`${BASE}/loyalty/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-merchant-id": merchantId },
    body: JSON.stringify({ enrollmentId, idempotencyKey: `rdm-${rnd()}` }),
  });
  if (!res.ok) throw new Error(`Redeem failed (${res.status})`);
}
