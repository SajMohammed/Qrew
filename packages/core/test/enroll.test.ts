import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminDb,
  closeDb,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
  loyaltyProgressEvents,
  customerAccounts,
} from "@qrew/db";
import { enroll, signInWithProvider, NotFoundError } from "../src/index";

let merchantId: string;
let programId: string;
const sfx = process.pid.toString(36);
const accountIds = new Set<string>();

beforeAll(async () => {
  const [m] = await adminDb.insert(merchants).values({ name: "Enroll Co", slug: `enr-${sfx}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 10, bonusStamps: 2 })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  if (accountIds.size) await adminDb.delete(customerAccounts).where(inArray(customerAccounts.id, [...accountIds]));
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
      .from(loyaltyProgressEvents)
      .where(and(eq(loyaltyProgressEvents.merchantId, merchantId), eq(loyaltyProgressEvents.source, "signup_bonus")));
    expect(bonuses).toHaveLength(1);
  });

  // Concurrency regression (C1): two simultaneous enrolls for the same account must produce ONE card
  // and seed the signup bonus ONCE — the (customer_id, program_id) unique index + onConflict make the
  // loser reuse the winner's card instead of forking a duplicate + double bonus.
  it("two concurrent enrolls for the same account make one card + one bonus", async () => {
    const { accountId } = await signInWithProvider({
      provider: "google",
      sub: `enr-cc-${sfx}`,
      email: `enr-cc-${sfx}@ex.com`,
      emailVerified: true,
    });
    accountIds.add(accountId);

    const [a, b] = await Promise.all([
      enroll({ merchantId, programId, customerAccountId: accountId }),
      enroll({ merchantId, programId, customerAccountId: accountId }),
    ]);

    expect(a.serial).toBe(b.serial); // one and the same card
    expect([a, b].filter((r) => !r.alreadyEnrolled).length).toBe(1); // exactly one winner
    expect(Math.max(a.currentStamps, b.currentStamps)).toBe(2); // bonus seeded once (program bonus=2), not 4

    const [cust] = await adminDb
      .select()
      .from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.customerAccountId, accountId)));
    const enrs = await adminDb.select().from(enrollments).where(eq(enrollments.customerId, cust!.id));
    expect(enrs).toHaveLength(1); // one customer row, one enrollment
  });

  // C2: an unknown program is a domain NotFoundError (→ the API maps it to 404, not a 500).
  it("throws NotFoundError for an unknown program", async () => {
    await expect(
      enroll({ merchantId, programId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
