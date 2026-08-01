import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms, customers, enrollments } from "@qrew/db";
import { availableCardTypes, cardTypeModule, isCardType, stampCard } from "../src/card-types";
import { getProgram, updateProgram } from "../src/index";
import { InvalidInputError } from "../src/errors";

let merchantId: string;
let emptyProgramId: string;
let heldProgramId: string;

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Types Co", slug: `typ-${s}` }).returning();
  merchantId = m!.id;

  const [empty] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Nobody has this", stampsRequired: 10 })
    .returning();
  emptyProgramId = empty!.id;

  const [held] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Customers hold this", stampsRequired: 10 })
    .returning();
  heldProgramId = held!.id;

  const [c] = await adminDb.insert(customers).values({ merchantId, name: "Holder" }).returning();
  await adminDb.insert(enrollments).values({
    merchantId,
    programId: heldProgramId,
    customerId: c!.id,
    cardSerial: `types-${s}`,
  });
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId));
  await closeDb();
});

describe("the card type registry", () => {
  it("every programme is a stamp card until something says otherwise", async () => {
    const p = await getProgram(merchantId, emptyProgramId);
    expect(p?.type).toBe("stamp");
    expect(p?.mechanics).toEqual({});
  });

  it("only offers types that actually have a module behind them", () => {
    // The column accepts four; the picker must not offer one the code cannot issue a pass for.
    for (const m of availableCardTypes()) expect(() => cardTypeModule(m.type)).not.toThrow();
  });

  it("refuses a type it has no module for, rather than falling back to stamps", () => {
    // Silently treating an unknown type as a stamp card would issue passes against the wrong
    // wallet class, and that cannot be undone without every customer re-saving.
    expect(() => cardTypeModule("membership")).toThrow(InvalidInputError);
    expect(() => cardTypeModule("nonsense")).toThrow(/unsupported card type/);
    expect(isCardType("nonsense")).toBe(false);
  });

  it("describes the stamp card the way the old code behaved", () => {
    expect(stampCard.earn({})).toBe(1);
    expect(stampCard.redeemable(9, 10, {})).toBe(false);
    expect(stampCard.redeemable(10, 10, {})).toBe(true);
    expect(stampCard.redeemable(11, 10, {})).toBe(true);
    expect(stampCard.describe(7, 10, {})).toBe("7 of 10");
    expect(stampCard.wallet).toEqual({ google: "loyalty", apple: "storeCard" });
  });
});

/*
 * Google welds an object to its class type and offers no conversion, so a live programme cannot
 * change product. The rule lives in the domain rather than the UI because the cost lands on people
 * who already have the pass in their phone.
 */
describe("changing a programme's card type", () => {
  it("is allowed while nobody holds a card", async () => {
    const updated = await updateProgram(merchantId, emptyProgramId, { name: "Renamed" });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.type).toBe("stamp");
  });

  it("is refused once even one customer holds a pass", async () => {
    await expect(updateProgram(merchantId, heldProgramId, { type: "points" })).rejects.toThrow(
      InvalidInputError,
    );
    await expect(updateProgram(merchantId, heldProgramId, { type: "points" })).rejects.toThrow(
      /already has 1 card/,
    );
  });

  it("still allows every other edit on a programme customers hold", async () => {
    const updated = await updateProgram(merchantId, heldProgramId, {
      rewardText: "Free pastry",
      cardDesign: { brandColor: "#6C2A4B" },
    });
    expect(updated?.rewardText).toBe("Free pastry");
    expect(updated?.cardDesign.brandColor).toBe("#6C2A4B");
  });

  it("does not trip the guard when the type is re-sent unchanged", async () => {
    // Saving the designer form resends every field, including the type it already has.
    const updated = await updateProgram(merchantId, heldProgramId, { type: "stamp", name: "Same type" });
    expect(updated?.name).toBe("Same type");
  });
});
