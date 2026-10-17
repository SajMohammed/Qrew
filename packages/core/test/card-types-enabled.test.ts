import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import {
  addStamp,
  createDefaultProgram,
  enroll,
  getCard,
  getShopAnalytics,
  getShopPreview,
  listCustomers,
  listPrograms,
  redeem,
  scanStamp,
  setCardTypeEnabled,
  updateProgram,
  ConflictError,
  InvalidInputError,
  type ProgramView,
} from "../src/index";

/*
 * A shop runs one card per type it turns on, each fully separate: its own programme, its own
 * enrolment (the counter QR carries the programme id), its own customers and numbers. Turning a
 * type off freezes its card — kept by its holders, redeemable, but taking no one new and nothing more.
 */

let merchantId: string;
let stamp: ProgramView;
let points: ProgramView;
const sfx = process.pid.toString(36);
let key = 0;
const k = (what: string) => `${what}-${sfx}-${++key}`;

beforeAll(async () => {
  const [m] = await adminDb.insert(merchants).values({ name: "Two Cards Co", slug: `two-${sfx}` }).returning();
  merchantId = m!.id;
  stamp = await createDefaultProgram(merchantId);
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId));
  await closeDb();
});

describe("which card types a shop runs", () => {
  it("a new shop runs a stamp card, on since it was created", async () => {
    expect(stamp.type).toBe("stamp");
    expect(stamp.status).toBe("active");
    expect(stamp.frozenAt).toBeNull();
    expect(Date.parse(stamp.enabledAt)).not.toBeNaN();
    expect((await listPrograms(merchantId)).map((p) => p.id)).toEqual([stamp.id]);
  });

  it("turning a type on creates its card with that type's own defaults", async () => {
    const cards = await setCardTypeEnabled(merchantId, "points", true);
    expect(cards.map((c) => c.type)).toEqual(["stamp", "points"]); // the shop's original card leads
    points = cards[1]!;
    expect(points).toMatchObject({
      name: "Points card",
      status: "active",
      stampsRequired: 500,
      bonusStamps: 0,
      mechanics: { unitLabel: "points", perVisit: 10, perCurrency: 0 },
    });
  });

  it("turning on a type that is already on changes nothing", async () => {
    const cards = await setCardTypeEnabled(merchantId, "points", true);
    expect(cards.map((c) => c.id)).toEqual([stamp.id, points.id]);
  });

  it("refuses a second card of a type, at the database too", async () => {
    // The designer can't turn the stamp card into the points card the shop already has…
    await expect(updateProgram(merchantId, stamp.id, { type: "points" })).rejects.toThrow(InvalidInputError);
    await expect(updateProgram(merchantId, stamp.id, { type: "points" })).rejects.toThrow(/already has a points card/);
    // …and nothing gets past the index either.
    await expect(
      adminDb.insert(loyaltyPrograms).values({ merchantId, name: "Second stamp card", type: "stamp" }),
    ).rejects.toThrow();
  });
});

describe("each card enrols through its own counter code", () => {
  let stampSerial: string;
  let pointsSerial: string;

  it("one customer holds both of the shop's cards, each its own card", async () => {
    const phone = `+9715${sfx}0101`;
    const a = await enroll({ merchantId, programId: stamp.id, phone });
    const b = await enroll({ merchantId, programId: points.id, phone });
    expect(b.serial).not.toBe(a.serial);
    expect(b.alreadyEnrolled).toBe(false);
    stampSerial = a.serial;
    pointsSerial = b.serial;

    const pointsCard = await getCard(pointsSerial);
    expect(pointsCard).toMatchObject({ programId: points.id, programName: "Points card", frozen: false });
    expect((await getCard(stampSerial))?.programId).toBe(stamp.id);
  });

  it("a scan acts on the scanned card, and says which card it was", async () => {
    const result = await scanStamp({ merchantId, serial: pointsSerial, idempotencyKey: k("scan") });
    expect(result).toMatchObject({
      found: true,
      applied: true,
      currentStamps: 10, // a points card's per-visit rate
      program: { id: points.id, name: "Points card", type: "points", status: "active" },
      cardsRunning: 2,
    });
    expect((await getCard(stampSerial))?.currentStamps).toBe(2); // the stamp card's signup bonus, untouched
  });

  it("the numbers can be read for one card", async () => {
    const shop = await getShopAnalytics(merchantId, "30d");
    const onPoints = await getShopAnalytics(merchantId, "30d", points.id);
    expect(shop.customers.total).toBe(1);
    expect(onPoints.customers.total).toBe(1);
    expect(onPoints.stampsIssued.value).toBe(10);
    expect(shop.stampsIssued.value).toBe(12); // with the stamp card's 2-stamp head start
    expect(shop.activity).toHaveLength(3); // two joins and a visit
    expect(onPoints.activity.map((a) => [a.kind, a.stampsRequired])).toEqual([
      ["stamp", 500],
      ["join", 500],
    ]);

    const holders = await listCustomers(merchantId, { programId: points.id });
    expect(holders.rows).toHaveLength(1);
    expect(holders.rows[0]).toMatchObject({ currentStamps: 10, stampsRequired: 500, visits: 1 });
  });
});

describe("turning a type off freezes its card", () => {
  let holderSerial: string;
  const holderPhone = `+9715${sfx}0202`;

  beforeAll(async () => {
    // A small target, so the holder has a reward to redeem once the card is frozen.
    await updateProgram(merchantId, points.id, { stampsRequired: 10 });
    holderSerial = (await enroll({ merchantId, programId: points.id, phone: holderPhone })).serial;
    await scanStamp({ merchantId, serial: holderSerial, idempotencyKey: k("scan") });
  });

  it("freezes rather than removes, and records when", async () => {
    const cards = await setCardTypeEnabled(merchantId, "points", false);
    const frozen = cards.find((c) => c.id === points.id)!;
    expect(frozen.status).toBe("frozen");
    expect(frozen.frozenAt).not.toBeNull();
    expect(cards.filter((c) => c.status === "active").map((c) => c.id)).toEqual([stamp.id]);
  });

  it("takes no new members, and its counter code shows nothing", async () => {
    const refused = enroll({ merchantId, programId: points.id, phone: `+9715${sfx}0303` });
    await expect(refused).rejects.toThrow(ConflictError);
    await expect(refused).rejects.toMatchObject({ code: "card_frozen" });
    expect(await getShopPreview(merchantId, points.id)).toBeNull();
    expect(await getShopPreview(merchantId, stamp.id)).not.toBeNull();
  });

  it("someone who already holds it still gets their own card back", async () => {
    const again = await enroll({ merchantId, programId: points.id, phone: holderPhone });
    expect(again).toMatchObject({ serial: holderSerial, alreadyEnrolled: true });
  });

  it("scans as frozen and adds nothing, scanned or stamped on purpose", async () => {
    const scanned = await scanStamp({ merchantId, serial: holderSerial, idempotencyKey: k("scan") });
    expect(scanned).toMatchObject({
      found: true,
      applied: false,
      reason: "frozen",
      currentStamps: 10,
      rewardReady: true,
      program: { status: "frozen" },
      cardsRunning: 1,
    });
    const extra = await addStamp({
      merchantId,
      enrollmentId: scannedId(scanned),
      idempotencyKey: k("extra"),
      deliberate: true,
    });
    expect(extra).toMatchObject({ applied: false, reason: "frozen", currentStamps: 10 });
    expect(await getCard(holderSerial)).toMatchObject({ frozen: true, currentStamps: 10 });
  });

  it("still redeems what the customer earned", async () => {
    const scanned = await scanStamp({ merchantId, serial: holderSerial, idempotencyKey: k("scan") });
    const r = await redeem({ merchantId, enrollmentId: scannedId(scanned), idempotencyKey: k("redeem") });
    expect(r).toMatchObject({ redeemed: true, reason: "redeemed", currentStamps: 0 });
  });

  it("won't turn off the shop's last card", async () => {
    await expect(setCardTypeEnabled(merchantId, "stamp", false)).rejects.toThrow(/only card your shop runs/);
  });

  it("turning the type back on unfreezes the same card, and it collects again", async () => {
    const cards = await setCardTypeEnabled(merchantId, "points", true);
    const back = cards.find((c) => c.type === "points")!;
    expect(back).toMatchObject({ id: points.id, status: "active", frozenAt: null });
    expect(Date.parse(back.enabledAt)).toBeGreaterThan(Date.parse(points.enabledAt));
    const scanned = await scanStamp({ merchantId, serial: holderSerial, idempotencyKey: k("scan") });
    expect(scanned).toMatchObject({ program: { status: "active" }, cardsRunning: 2 });
    // Deliberate: the camera's cooldown would hold back a second read inside the minute.
    const stamped = await addStamp({
      merchantId,
      enrollmentId: scannedId(scanned),
      idempotencyKey: k("extra"),
      deliberate: true,
    });
    expect(stamped).toMatchObject({ applied: true, currentStamps: 10 });
  });
});

function scannedId(result: Awaited<ReturnType<typeof scanStamp>>): string {
  if (!result.found) throw new Error("card not found");
  return result.enrollmentId;
}
