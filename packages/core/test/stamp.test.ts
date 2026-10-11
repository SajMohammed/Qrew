import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { enroll, addStamp, ConflictError, NotFoundError } from "../src/index";

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

  it("the cooldown is a minute unless configured", async () => {
    const saved = process.env.STAMP_COOLDOWN_SECONDS;
    delete process.env.STAMP_COOLDOWN_SECONDS;
    try {
      const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000015" });
      expect((await addStamp({ merchantId, enrollmentId, idempotencyKey: "def-1" })).applied).toBe(true);
      expect((await addStamp({ merchantId, enrollmentId, idempotencyKey: "def-2" })).reason).toBe("cooldown");
    } finally {
      process.env.STAMP_COOLDOWN_SECONDS = saved;
    }
  });

  // The counter resends with the same key when a response is lost. That retry must replay as the
  // stamp it repeats — never "cooldown", which would tell the cashier the stamp wasn't added.
  it("a retry of a stamp that landed replays as a duplicate, inside the cooldown", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "60";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000016" });
    const first = await addStamp({ merchantId, enrollmentId, idempotencyKey: "retry-1" });
    const retry = await addStamp({ merchantId, enrollmentId, idempotencyKey: "retry-1" });
    expect(first.reason).toBe("applied");
    expect(retry.reason).toBe("duplicate");
    expect(retry.currentStamps).toBe(1);
  });

  it("a retry of the stamp that filled the card replays as a duplicate, not 'reward ready'", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000017" });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: "fill-1" });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: "fill-2" });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: "fill-3" });
    const retry = await addStamp({ merchantId, enrollmentId, idempotencyKey: "fill-3" });
    expect(retry.reason).toBe("duplicate");
    expect(retry.rewardReady).toBe(true);
  });

  it("refuses a key already used on a different card", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";
    const a = await enroll({ merchantId, programId, phone: "+971500000018" });
    const b = await enroll({ merchantId, programId, phone: "+971500000019" });
    await addStamp({ merchantId, enrollmentId: a.enrollmentId, idempotencyKey: "shared" });
    await expect(
      addStamp({ merchantId, enrollmentId: b.enrollmentId, idempotencyKey: "shared" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  // Only the card's own row is locked, so the same key on two cards at once both pass the key check.
  // The one that loses the insert must not be told "duplicate" — that would claim a stamp it never got.
  it("refuses a key raced onto two cards at once", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";
    // Several pairs: one alone may not overlap, and then the key check catches it the ordinary way.
    for (let i = 0; i < 5; i++) {
      const a = await enroll({ merchantId, programId, phone: `+97150000020${i}` });
      const b = await enroll({ merchantId, programId, phone: `+97150000021${i}` });
      const results = await Promise.allSettled([
        addStamp({ merchantId, enrollmentId: a.enrollmentId, idempotencyKey: `raced-${i}` }),
        addStamp({ merchantId, enrollmentId: b.enrollmentId, idempotencyKey: `raced-${i}` }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled" && r.value.reason === "applied")).toHaveLength(1);
      const lost = results.find((r) => r.status === "rejected");
      expect(lost?.status === "rejected" && lost.reason instanceof ConflictError).toBe(true);
    }
  });

  it("a deliberate stamp skips the cooldown, and a camera read after it still waits", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "60";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000101" });
    expect((await addStamp({ merchantId, enrollmentId, idempotencyKey: "dl-1" })).applied).toBe(true);
    const extra = await addStamp({ merchantId, enrollmentId, idempotencyKey: "dl-2", deliberate: true });
    expect(extra.applied).toBe(true);
    expect(extra.currentStamps).toBe(2);
    expect((await addStamp({ merchantId, enrollmentId, idempotencyKey: "dl-3" })).reason).toBe("cooldown");
  });

  it("a deliberate stamp is still idempotent", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "60";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000102" });
    const once = await addStamp({ merchantId, enrollmentId, idempotencyKey: "dl-dup", deliberate: true });
    const twice = await addStamp({ merchantId, enrollmentId, idempotencyKey: "dl-dup", deliberate: true });
    expect(once.reason).toBe("applied");
    expect(twice.reason).toBe("duplicate");
    expect(twice.currentStamps).toBe(1);
  });

  // Concurrency regression (C1): two simultaneous scans (distinct keys) on a card one below the cap
  // must not both apply — the FOR UPDATE lock serializes them so the count can't exceed the threshold.
  it("two concurrent scans at the cap don't exceed it", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";
    const { enrollmentId } = await enroll({ merchantId, programId, phone: "+971500000014" });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: "cap-1" });
    await addStamp({ merchantId, enrollmentId, idempotencyKey: "cap-2" }); // now 2/3

    const [a, b] = await Promise.all([
      addStamp({ merchantId, enrollmentId, idempotencyKey: "cap-3a" }),
      addStamp({ merchantId, enrollmentId, idempotencyKey: "cap-3b" }),
    ]);

    expect([a, b].filter((r) => r.applied).length).toBe(1); // exactly one stamped
    expect([a, b].filter((r) => r.reason === "reward_ready").length).toBe(1); // the other hit the cap
    expect(Math.max(a.currentStamps, b.currentStamps)).toBe(3); // capped at 3 — never 4
  });

  // C2: an unknown enrollment is a domain NotFoundError (→ 404, not a 500).
  it("throws NotFoundError for an unknown enrollment", async () => {
    await expect(
      addStamp({ merchantId, enrollmentId: "00000000-0000-0000-0000-000000000000", idempotencyKey: "nf-stamp" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
