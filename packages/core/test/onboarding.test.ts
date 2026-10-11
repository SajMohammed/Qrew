import { describe, it, expect, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { adminDb, closeDb, withTenant, merchants, loyaltyPrograms } from "@qrew/db";
import { createDefaultProgram } from "../src/index";

let merchantId: string;
let racedId: string;

afterAll(async () => {
  for (const id of [merchantId, racedId]) {
    if (id) await adminDb.delete(merchants).where(eq(merchants.id, id)); // cascades
  }
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

  it("seeds exactly one programme when first sign-ins race (two tabs)", async () => {
    const [m] = await adminDb
      .insert(merchants)
      .values({ name: "Race Co", slug: `race-${process.pid.toString(36)}` })
      .returning();
    racedId = m!.id;

    // The pool opens connections lazily, so on a fast local database calls would otherwise run back
    // to back and never overlap. Holding ten connections open at once first makes them truly concurrent.
    await Promise.all(Array.from({ length: 10 }, () => withTenant(racedId, (db) => db.execute(sql`select pg_sleep(0.05)`))));
    const seeded = await Promise.all(Array.from({ length: 10 }, () => createDefaultProgram(racedId)));
    expect(new Set(seeded.map((p) => p.id)).size).toBe(1);
    const rows = await adminDb.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, racedId));
    expect(rows).toHaveLength(1);
  });
});
