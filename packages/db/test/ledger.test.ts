import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  adminDb,
  closeDb,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
  loyaltyProgressEvents,
} from "../src/index";

/**
 * The projection (`enrollments.current_progress`) is maintained by a DB trigger, so it is
 * correct by construction — no reconciliation job needed. Setup uses the admin connection
 * (bypasses RLS); the trigger fires regardless of RLS.
 */
let merchantId: string;
let enrollmentId: string;

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Ledger Co", slug: `led-${s}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb.insert(loyaltyPrograms).values({ merchantId, name: "Card" }).returning();
  const [c] = await adminDb.insert(customers).values({ merchantId, name: "Cust" }).returning();
  const [e] = await adminDb
    .insert(enrollments)
    .values({ merchantId, programId: p!.id, customerId: c!.id, cardSerial: `ser-${s}` })
    .returning();
  enrollmentId = e!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  await closeDb();
});

async function currentStamps(): Promise<number> {
  const [e] = await adminDb
    .select({ n: enrollments.currentProgress })
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId));
  return e!.n;
}
async function ledgerSum(): Promise<number> {
  const [r] = await adminDb
    .select({ total: sql<number>`coalesce(sum(${loyaltyProgressEvents.delta}), 0)` })
    .from(loyaltyProgressEvents)
    .where(eq(loyaltyProgressEvents.enrollmentId, enrollmentId));
  return Number(r!.total);
}

describe("ledger-maintained projection", () => {
  it("the trigger keeps current_progress == sum(delta)", async () => {
    await adminDb.insert(loyaltyProgressEvents).values({ merchantId, enrollmentId, delta: 2, source: "signup_bonus", idempotencyKey: "bonus" });
    await adminDb.insert(loyaltyProgressEvents).values({ merchantId, enrollmentId, delta: 1, idempotencyKey: "s1" });
    await adminDb.insert(loyaltyProgressEvents).values({ merchantId, enrollmentId, delta: 1, idempotencyKey: "s2" });
    expect(await currentStamps()).toBe(4);
    expect(await currentStamps()).toBe(await ledgerSum());
  });

  it("a duplicate idempotency key does not double-apply", async () => {
    const before = await currentStamps();
    await adminDb
      .insert(loyaltyProgressEvents)
      .values({ merchantId, enrollmentId, delta: 1, idempotencyKey: "s1" })
      .onConflictDoNothing({ target: [loyaltyProgressEvents.merchantId, loyaltyProgressEvents.idempotencyKey] });
    expect(await currentStamps()).toBe(before);
  });

  it("a negative delta (redemption) decrements the balance", async () => {
    const before = await currentStamps();
    await adminDb.insert(loyaltyProgressEvents).values({ merchantId, enrollmentId, delta: -before, source: "redemption", idempotencyKey: "r1" });
    expect(await currentStamps()).toBe(0);
  });

  it("the ledger is append-only — UPDATE throws", async () => {
    await expect(
      adminDb.update(loyaltyProgressEvents).set({ delta: 99 }).where(eq(loyaltyProgressEvents.enrollmentId, enrollmentId)),
    ).rejects.toThrow();
  });
});
