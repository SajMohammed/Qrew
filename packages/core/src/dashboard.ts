import { desc, eq, gt, sql } from "drizzle-orm";
import {
  withTenant,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
  loyaltyProgressEvents,
  redemptions,
} from "@qrew/db";

export interface DashboardStats {
  enrollments: number;
  activeCards: number;
  rewardReady: number;
  stampsIssued: number;
  rewardsRedeemed: number;
}

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
  merchantId: string; // the owner's own public id (routing for the enroll QR — not a secret)
  merchantName: string;
  stats: DashboardStats;
  recent: RecentEnrollment[];
}

/** Merchant dashboard overview — all tenant-scoped (RLS). */
export async function getDashboard(merchantId: string): Promise<Dashboard> {
  return withTenant(merchantId, async (db) => {
    const n = sql<number>`count(*)::int`;

    const [merchant] = await db.select({ name: merchants.name }).from(merchants);
    const [enr] = await db.select({ n }).from(enrollments);
    const [act] = await db.select({ n }).from(enrollments).where(eq(enrollments.status, "active"));
    const [rdy] = await db
      .select({ n })
      .from(enrollments)
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
      .where(sql`${enrollments.currentProgress} >= ${loyaltyPrograms.stampsRequired}`);
    const [iss] = await db.select({ n }).from(loyaltyProgressEvents).where(gt(loyaltyProgressEvents.delta, 0));
    const [red] = await db.select({ n }).from(redemptions);

    const recent = await db
      .select({
        id: enrollments.id,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        programName: loyaltyPrograms.name,
        currentStamps: enrollments.currentProgress,
        stampsRequired: loyaltyPrograms.stampsRequired,
        createdAt: enrollments.createdAt,
      })
      .from(enrollments)
      .innerJoin(customers, eq(customers.id, enrollments.customerId))
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
      .orderBy(desc(enrollments.createdAt))
      .limit(10);

    return {
      merchantId,
      merchantName: merchant?.name ?? "",
      stats: {
        enrollments: Number(enr?.n ?? 0),
        activeCards: Number(act?.n ?? 0),
        rewardReady: Number(rdy?.n ?? 0),
        stampsIssued: Number(iss?.n ?? 0),
        rewardsRedeemed: Number(red?.n ?? 0),
      },
      recent: recent.map((r) => ({
        id: r.id,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        programName: r.programName,
        currentStamps: r.currentStamps,
        stampsRequired: r.stampsRequired,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });
}
