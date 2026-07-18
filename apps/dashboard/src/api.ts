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

export async function getProgram(merchantId: string): Promise<Program> {
  const res = await fetch(`${BASE}/program`, { headers: { "x-merchant-id": merchantId } });
  if (!res.ok) throw new Error(`Program failed (${res.status})`);
  return res.json();
}

export async function updateProgram(merchantId: string, id: string, patch: ProgramPatch): Promise<Program> {
  const res = await fetch(`${BASE}/program/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-merchant-id": merchantId },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return res.json();
}
