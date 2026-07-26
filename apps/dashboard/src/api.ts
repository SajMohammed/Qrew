// Response/request shapes. The fetching lives in useApi.ts (it needs the Clerk token hook).

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
