const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export interface RecentEnrollment {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  programName: string;
  currentStamps: number;
  stampsRequired: number;
  createdAt: string;
}

export interface Dashboard {
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

export async function getDashboard(merchantId: string): Promise<Dashboard> {
  const res = await fetch(`${BASE}/dashboard`, { headers: { "x-merchant-id": merchantId } });
  if (!res.ok) throw new Error(`Dashboard failed (${res.status})`);
  return res.json();
}
