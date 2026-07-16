import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { enroll, addStamp, redeem, getDashboard } from "../src/index";

let merchantId: string;
let programId: string;

beforeAll(async () => {
  process.env.STAMP_COOLDOWN_SECONDS = "0";
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Dash Co", slug: `dash-${s}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 3, bonusStamps: 0 })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId));
  await closeDb();
});

describe("getDashboard", () => {
  it("aggregates enrollments, stamps and redemptions", async () => {
    const e1 = await enroll({ merchantId, programId, phone: "+971500000040" });
    await addStamp({ merchantId, enrollmentId: e1.enrollmentId, idempotencyKey: "d1" });
    await addStamp({ merchantId, enrollmentId: e1.enrollmentId, idempotencyKey: "d2" });
    await addStamp({ merchantId, enrollmentId: e1.enrollmentId, idempotencyKey: "d3" });
    await redeem({ merchantId, enrollmentId: e1.enrollmentId, idempotencyKey: "dr1" });

    const e2 = await enroll({ merchantId, programId, phone: "+971500000041" });
    await addStamp({ merchantId, enrollmentId: e2.enrollmentId, idempotencyKey: "d4" });

    const d = await getDashboard(merchantId);
    expect(d.merchantName).toBe("Dash Co");
    expect(d.stats.enrollments).toBe(2);
    expect(d.stats.activeCards).toBe(2);
    expect(d.stats.rewardsRedeemed).toBe(1);
    expect(d.stats.stampsIssued).toBe(4); // 3 earns + 1 earn (redemption's -3 is excluded)
    expect(d.recent).toHaveLength(2);
  });
});
