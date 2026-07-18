import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { enroll, getProgram, updateProgram, getCard } from "../src/index";

let merchantId: string;
let programId: string;

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Design Co", slug: `dsn-${s}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 5, bonusStamps: 0 })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId));
  await closeDb();
});

describe("program (card designer)", () => {
  it("returns the program with a default design", async () => {
    const p = await getProgram(merchantId);
    expect(p?.id).toBe(programId);
    expect(p?.cardDesign.brandColor).toBe("#0E6B62");
    expect(p?.cardDesign.stampIcon).toBe("☕");
  });

  it("updates fields and merges cardDesign (unset keys keep their value)", async () => {
    const updated = await updateProgram(merchantId, programId, {
      rewardText: "free pastry",
      stampsRequired: 8,
      cardDesign: { brandColor: "#6C2A4B" },
    });
    expect(updated?.rewardText).toBe("free pastry");
    expect(updated?.stampsRequired).toBe(8);
    expect(updated?.cardDesign.brandColor).toBe("#6C2A4B");
    expect(updated?.cardDesign.stampIcon).toBe("☕"); // merged, not lost
  });

  it("the customer card reflects the merchant's design", async () => {
    const e = await enroll({ merchantId, programId, phone: "+971500000050" });
    const card = await getCard(e.serial);
    expect(card?.brandColor).toBe("#6C2A4B");
    expect(card?.stampIcon).toBe("☕");
    expect(card?.rewardText).toBe("free pastry");
  });
});
