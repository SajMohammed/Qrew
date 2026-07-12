import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms, enrollments, stampEvents } from "@qrew/db";
import { enroll } from "../src/index";

let merchantId: string;
let programId: string;

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Enroll Co", slug: `enr-${s}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 10, bonusStamps: 2 })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  await closeDb();
});

describe("enroll", () => {
  const phone = "+971500000001";
  let firstEnrollmentId: string;

  it("creates a customer + enrollment, seeds bonus stamps, issues a pass", async () => {
    const res = await enroll({ merchantId, programId, phone, name: "Aya" });
    firstEnrollmentId = res.enrollmentId;
    expect(res.alreadyEnrolled).toBe(false);
    expect(res.currentStamps).toBe(2); // endowed-progress bonus
    expect(res.applePassId).toBeTruthy();
    expect(res.googleObjectId).toBeTruthy();
  });

  it("is idempotent per customer + program (no new card, no double bonus)", async () => {
    const res = await enroll({ merchantId, programId, phone });
    expect(res.alreadyEnrolled).toBe(true);
    expect(res.enrollmentId).toBe(firstEnrollmentId);

    const rows = await adminDb.select().from(enrollments).where(eq(enrollments.merchantId, merchantId));
    expect(rows).toHaveLength(1);

    const bonuses = await adminDb
      .select()
      .from(stampEvents)
      .where(and(eq(stampEvents.merchantId, merchantId), eq(stampEvents.source, "signup_bonus")));
    expect(bonuses).toHaveLength(1);
  });
});
