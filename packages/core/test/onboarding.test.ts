import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { createDefaultProgram } from "../src/index";

let merchantId: string;

afterAll(async () => {
  if (merchantId) await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  await closeDb();
});

describe("createDefaultProgram", () => {
  it("seeds a default program for a new merchant, idempotently", async () => {
    const [m] = await adminDb
      .insert(merchants)
      .values({ name: "Onboard Co", slug: `onb-${process.pid.toString(36)}` })
      .returning();
    merchantId = m!.id;

    const p1 = await createDefaultProgram(merchantId);
    expect(p1.stampsRequired).toBe(10);
    expect(p1.bonusStamps).toBe(2);
    expect(p1.rewardText).toBe("1 free item");
    expect(p1.cardDesign.brandColor).toBe("#146A2E"); // Qrew forest default

    const p2 = await createDefaultProgram(merchantId); // idempotent — no second program
    expect(p2.id).toBe(p1.id);

    const rows = await adminDb.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId));
    expect(rows).toHaveLength(1);
  });
});
