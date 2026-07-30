import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  adminDb,
  closeDb,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
} from "@qrew/db";
import { enroll, addStamp, redeem, getShopAnalytics } from "../src/index";

let merchantId: string;
let programId: string;

/**
 * One shop with a deliberate spread of behaviour, so every panel has something real to report:
 *   Aisha  5 visits            → regular, returned
 *   Bilal  2 visits            → returned only
 *   Carla  1 visit             → new
 *   Dana   joined 40d ago, none→ at risk (and outside the 30d window, so she lands in "previous")
 *   Elena  10 visits + redeem  → earned a reward
 *   Farid  10 visits, no redeem→ reward-ready
 */
const STAMPS_REQUIRED = 10;

async function stamp(enrollmentId: string, prefix: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await addStamp({ merchantId, enrollmentId, idempotencyKey: `${prefix}-${i}` });
  }
}

beforeAll(async () => {
  process.env.STAMP_COOLDOWN_SECONDS = "0";
  const s = process.pid.toString(36);
  const [m] = await adminDb
    .insert(merchants)
    .values({ name: "Analytics Co", slug: `analytics-${s}` })
    .returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: STAMPS_REQUIRED, bonusStamps: 0 })
    .returning();
  programId = p!.id;

  const a = await enroll({ merchantId, programId, phone: "+971500000101", name: "Aisha" });
  await stamp(a.enrollmentId, "a", 5);
  const b = await enroll({ merchantId, programId, phone: "+971500000102", name: "Bilal" });
  await stamp(b.enrollmentId, "b", 2);
  const c = await enroll({ merchantId, programId, phone: "+971500000103", name: "Carla" });
  await stamp(c.enrollmentId, "c", 1);

  // Dana is written directly so she can be backdated — the public enroll path always stamps "now",
  // and going quiet is a property of elapsed time.
  const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const [dana] = await adminDb
    .insert(customers)
    .values({ merchantId, name: "Dana", phone: "+971500000104", createdAt: past })
    .returning();
  await adminDb
    .insert(enrollments)
    .values({ merchantId, programId, customerId: dana!.id, cardSerial: randomUUID(), createdAt: past })
    .returning();

  const e = await enroll({ merchantId, programId, phone: "+971500000105", name: "Elena" });
  await stamp(e.enrollmentId, "e", STAMPS_REQUIRED);

  const f = await enroll({ merchantId, programId, phone: "+971500000106", name: "Farid" });
  await stamp(f.enrollmentId, "f", STAMPS_REQUIRED);

  // Redeemed last so it is the newest event in the ledger — otherwise Farid's ten stamps fill the
  // feed and a redemption could never be observed in it.
  await redeem({ merchantId, enrollmentId: e.enrollmentId, idempotencyKey: "elena-redeem" });
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId));
  await closeDb();
});

describe("getShopAnalytics", () => {
  it("reports headline counters against the previous window", async () => {
    const a = await getShopAnalytics(merchantId, "30d");

    expect(a.merchantName).toBe("Analytics Co");
    expect(a.range).toBe("30d");
    expect(a.customers.total).toBe(6);
    // Dana joined 40 days ago, so she is not new in this window — she is in the one before it.
    expect(a.customers.value).toBe(5);
    expect(a.customers.previous).toBe(1);
    // 5 + 2 + 1 + 10 + 10 visits; the redemption's -10 is a spend, not an issue.
    expect(a.stampsIssued.value).toBe(28);
    expect(a.rewardsRedeemed.value).toBe(1);
  });

  it("counts the actions an owner can take today", async () => {
    const a = await getShopAnalytics(merchantId, "30d");

    expect(a.actions.atRiskDays).toBe(14);
    // Farid is full; Elena spent hers back down to zero.
    expect(a.actions.rewardReady).toBe(1);
    // Only Dana has been quiet longer than the window.
    expect(a.actions.atRisk).toBe(1);
  });

  it("builds the retention ladder from visits, not enrollments", async () => {
    const a = await getShopAnalytics(merchantId, "30d");

    expect(a.ladder.joined).toBe(6);
    expect(a.ladder.returned).toBe(4); // Aisha, Bilal, Elena, Farid
    expect(a.ladder.regulars).toBe(3); // Aisha, Elena, Farid
    expect(a.ladder.earnedReward).toBe(1); // Elena

    // 4 of the 5 who ever visited came back — Dana never did, so she is not in the denominator.
    expect(a.repeatRate.value).toBe(80);
  });

  it("returns a zero-filled daily series for the whole window", async () => {
    const a = await getShopAnalytics(merchantId, "30d");

    expect(a.series.bucket).toBe("day");
    expect(a.series.points).toHaveLength(30);
    expect(a.series.points.reduce((sum, p) => sum + p.stamps, 0)).toBe(28);
    // Quiet days are present as zeros rather than missing, so the chart shows the gap.
    expect(a.series.points.filter((p) => p.stamps === 0).length).toBeGreaterThan(0);
    expect(a.series.points.at(-1)?.stamps).toBe(28);
  });

  it("buckets by week over 90 days", async () => {
    const a = await getShopAnalytics(merchantId, "90d");

    expect(a.series.bucket).toBe("week");
    expect(a.series.points).toHaveLength(13);
    expect(a.series.points.reduce((sum, p) => sum + p.stamps, 0)).toBe(28);
  });

  it("merges stamps, redemptions and joins into one feed", async () => {
    const a = await getShopAnalytics(merchantId, "30d");

    expect(a.activity).toHaveLength(8);
    // Newest first.
    const times = a.activity.map((i) => i.at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(a.activity.some((i) => i.kind === "redeem")).toBe(true);

    const redeemItem = a.activity.find((i) => i.kind === "redeem");
    expect(redeemItem?.rewardText).toBeTruthy();
    expect(redeemItem?.customerName).toBe("Elena");
  });

  it("ranks top regulars by visits and excludes those who never came", async () => {
    const a = await getShopAnalytics(merchantId, "30d");

    expect(a.topRegulars).toHaveLength(5); // Dana has no visits, so she is absent
    expect(a.topRegulars[0]?.visits).toBe(10);
    expect(a.topRegulars.map((t) => t.name)).not.toContain("Dana");

    const visits = a.topRegulars.map((t) => t.visits);
    expect([...visits].sort((x, y) => y - x)).toEqual(visits);
  });

  it("is empty, not broken, for a brand-new shop", async () => {
    const s = process.pid.toString(36);
    const [m] = await adminDb
      .insert(merchants)
      .values({ name: "Fresh Co", slug: `fresh-${s}` })
      .returning();
    try {
      const a = await getShopAnalytics(m!.id, "7d");
      expect(a.customers.total).toBe(0);
      expect(a.repeatRate.value).toBe(0); // 0 of 0 is 0%, not NaN
      expect(a.ladder.joined).toBe(0);
      expect(a.activity).toEqual([]);
      expect(a.topRegulars).toEqual([]);
      expect(a.series.points).toHaveLength(7);
      expect(a.series.points.every((p) => p.stamps === 0)).toBe(true);
    } finally {
      await adminDb.delete(merchants).where(eq(merchants.id, m!.id));
    }
  });
});
