import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { enroll, getProgram, updateProgram, getCard, getShopPreview } from "../src/index";

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
    expect(p?.cardDesign.brandColor).toBe("#146A2E");
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

  it("getShopPreview returns the public shop branding for the enroll landing", async () => {
    const preview = await getShopPreview(merchantId, programId);
    expect(preview?.merchantName).toBe("Design Co");
    expect(preview?.rewardText).toBe("free pastry");
    expect(preview?.stampsRequired).toBe(8);
    expect(preview?.brandColor).toBe("#6C2A4B");
    expect(preview?.stampIcon).toBe("☕");
    // unknown program → null (the endpoint maps this to 404)
    expect(await getShopPreview(merchantId, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

/*
 * Its own programme, deliberately. These mutate the design, and sharing the fixture with the
 * defaults test made that one fail depending on which ran first — an order-dependent suite hides
 * real failures behind whichever test happened to run last.
 */
describe("clearing part of a design", () => {
  let ownProgramId: string;

  beforeAll(async () => {
    const [p] = await adminDb
      .insert(loyaltyPrograms)
      .values({ merchantId, name: "Clearing", stampsRequired: 5 })
      .returning();
    ownProgramId = p!.id;
  });

  /*
   * A patch merges over the current design so the console can send one field, which means clearing
   * has to be explicit. Omitting a key reads as "leave it alone" — the console once sent undefined
   * for a removed image, JSON.stringify dropped the key, and the old image kept being served while
   * the UI showed it gone.
   */
  it("clears an image when sent an empty string, and keeps it when the key is absent", async () => {
    await updateProgram(merchantId, ownProgramId, {
      cardDesign: { customStripUrl: "https://shop.test/strip.png", logoUrl: "https://shop.test/logo.png" },
    });

    const untouched = await updateProgram(merchantId, ownProgramId, { cardDesign: { brandColor: "#111111" } });
    expect(untouched?.cardDesign.customStripUrl).toBe("https://shop.test/strip.png");

    const cleared = await updateProgram(merchantId, ownProgramId, { cardDesign: { customStripUrl: "" } });
    expect(cleared?.cardDesign.customStripUrl).toBeUndefined();
    // Clearing one image must not take the others with it.
    expect(cleared?.cardDesign.logoUrl).toBe("https://shop.test/logo.png");
  });

  it("does not leave emptied fields behind in the stored design", async () => {
    const saved = await updateProgram(merchantId, ownProgramId, {
      cardDesign: { stampImageUrl: "", emptyStampImageUrl: "" },
    });
    // Normalised on write, so the row stays canonical instead of accumulating empty strings.
    expect(Object.keys(saved!.cardDesign)).not.toContain("stampImageUrl");
    expect(Object.keys(saved!.cardDesign)).not.toContain("emptyStampImageUrl");
  });
});
