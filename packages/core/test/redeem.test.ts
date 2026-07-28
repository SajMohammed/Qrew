import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms, redemptions } from "@qrew/db";
import { enroll, addStamp, redeem, NotFoundError } from "../src/index";

let merchantId: string;
let programId: string;

beforeAll(async () => {
  process.env.STAMP_COOLDOWN_SECONDS = "0";
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Redeem Co", slug: `rdm-${s}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 3, bonusStamps: 0, rewardText: "1 free coffee" })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  await closeDb();
});

async function enrolledWith3Stamps(phone: string): Promise<string> {
  const { enrollmentId } = await enroll({ merchantId, programId, phone });
  await addStamp({ merchantId, enrollmentId, idempotencyKey: `${phone}-1` });
  await addStamp({ merchantId, enrollmentId, idempotencyKey: `${phone}-2` });
  await addStamp({ merchantId, enrollmentId, idempotencyKey: `${phone}-3` });
  return enrollmentId;
}

describe("redeem", () => {
  it("redeems when eligible and resets the balance to zero", async () => {
    const enrollmentId = await enrolledWith3Stamps("+971500000020");
    const r = await redeem({ merchantId, enrollmentId, idempotencyKey: "rd-1" });
    expect(r.redeemed).toBe(true);
    expect(r.reason).toBe("redeemed");
    expect(r.currentStamps).toBe(0);
    expect(r.rewardText).toBe("1 free coffee");
  });

  it("is idempotent — a repeat with the same key does not double-spend", async () => {
    const enrollmentId = await enrolledWith3Stamps("+971500000021");
    await redeem({ merchantId, enrollmentId, idempotencyKey: "rd-dup" });
    const again = await redeem({ merchantId, enrollmentId, idempotencyKey: "rd-dup" });
    expect(again.reason).toBe("duplicate");
    expect(again.currentStamps).toBe(0);

    const rows = await adminDb
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.merchantId, merchantId), eq(redemptions.enrollmentId, enrollmentId)));
    expect(rows).toHaveLength(1); // never a second redemption
  });

  it("rejects redemption when the balance is insufficient", async () => {
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000022" }); // 0 stamps
    const r = await redeem({ merchantId, enrollmentId, idempotencyKey: "rd-3" });
    expect(r.redeemed).toBe(false);
    expect(r.reason).toBe("insufficient");
  });

  // Concurrency regression (C1): two simultaneous redeems (distinct keys) on a full card must issue
  // the reward exactly once and never drive the balance negative — the FOR UPDATE lock serializes them.
  it("two concurrent redeems issue the reward once and never go negative", async () => {
    const enrollmentId = await enrolledWith3Stamps("+971500000023");
    const [a, b] = await Promise.all([
      redeem({ merchantId, enrollmentId, idempotencyKey: "rd-cc-a" }),
      redeem({ merchantId, enrollmentId, idempotencyKey: "rd-cc-b" }),
    ]);
    // one real redemption; the loser blocks, re-reads balance 0, returns insufficient
    expect([a, b].filter((r) => r.reason === "redeemed").length).toBe(1);
    expect([a, b].filter((r) => r.reason === "insufficient").length).toBe(1);
    expect(a.currentStamps).toBeGreaterThanOrEqual(0);
    expect(b.currentStamps).toBeGreaterThanOrEqual(0);

    const rows = await adminDb
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.merchantId, merchantId), eq(redemptions.enrollmentId, enrollmentId)));
    expect(rows).toHaveLength(1); // exactly one reward handed out
  });

  // C2: an unknown enrollment is a domain NotFoundError (→ 404, not a 500).
  it("throws NotFoundError for an unknown enrollment", async () => {
    await expect(
      redeem({ merchantId, enrollmentId: "00000000-0000-0000-0000-000000000000", idempotencyKey: "nf-redeem" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
