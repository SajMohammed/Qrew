import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { enroll, addStamp } from "../src/index";

let merchantId: string;
let programId: string;

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Stamp Co", slug: `stm-${s}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 3, bonusStamps: 0 })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  await closeDb();
});

describe("addStamp", () => {
  it("accumulates stamps and flags reward-ready at the threshold", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000010" });

    const r1 = await addStamp({ merchantId, enrollmentId, idempotencyKey: "k1" });
    expect(r1.applied).toBe(true);
    expect(r1.currentStamps).toBe(1);
    expect(r1.rewardReady).toBe(false);

    await addStamp({ merchantId, enrollmentId, idempotencyKey: "k2" });
    const r3 = await addStamp({ merchantId, enrollmentId, idempotencyKey: "k3" });
    expect(r3.currentStamps).toBe(3);
    expect(r3.rewardReady).toBe(true);
  });

  it("does not stamp past the reward threshold — the card caps until redeemed", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000013" });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: "t1" });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: "t2" });
    const full = await addStamp({ merchantId, enrollmentId, idempotencyKey: "t3" });
    expect(full.currentStamps).toBe(3);
    expect(full.rewardReady).toBe(true);

    const over = await addStamp({ merchantId, enrollmentId, idempotencyKey: "t4" });
    expect(over.applied).toBe(false);
    expect(over.reason).toBe("reward_ready");
    expect(over.currentStamps).toBe(3); // capped — not 4
  });

  it("a duplicate idempotency key does not add a stamp", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000011" });

    const first = await addStamp({ merchantId, enrollmentId, idempotencyKey: "dup" });
    const again = await addStamp({ merchantId, enrollmentId, idempotencyKey: "dup" });
    expect(first.applied).toBe(true);
    expect(again.applied).toBe(false);
    expect(again.reason).toBe("duplicate");
    expect(again.currentStamps).toBe(first.currentStamps);
  });

  it("a rapid re-scan is ignored (cooldown)", async () => {
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000012" });

    process.env.STAMP_COOLDOWN_SECONDS = "0";
    const first = await addStamp({ merchantId, enrollmentId, idempotencyKey: "c1" });
    expect(first.applied).toBe(true);

    process.env.STAMP_COOLDOWN_SECONDS = "60";
    const second = await addStamp({ merchantId, enrollmentId, idempotencyKey: "c2" });
    expect(second.applied).toBe(false);
    expect(second.reason).toBe("cooldown");
  });
});
