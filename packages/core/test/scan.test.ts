import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { enroll, scanStamp } from "../src/index";

let merchantA: string;
let merchantB: string;
let programA: string;

beforeAll(async () => {
  process.env.STAMP_COOLDOWN_SECONDS = "0";
  const s = process.pid.toString(36);
  const [a] = await adminDb.insert(merchants).values({ name: "Scan A", slug: `sca-${s}` }).returning();
  const [b] = await adminDb.insert(merchants).values({ name: "Scan B", slug: `scb-${s}` }).returning();
  merchantA = a!.id;
  merchantB = b!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId: merchantA, name: "Card", stampsRequired: 3, bonusStamps: 0 })
    .returning();
  programA = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantA));
  await adminDb.delete(merchants).where(eq(merchants.id, merchantB));
  await closeDb();
});

describe("scanStamp", () => {
  let serial: string;

  it("stamps a card by its scanned serial", async () => {
    const e = await enroll({ merchantId: merchantA, programId: programA, phone: "+971500000030" });
    serial = e.serial;
    const r = await scanStamp({ merchantId: merchantA, serial, idempotencyKey: "scan-a-1" });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.applied).toBe(true);
      expect(r.currentStamps).toBe(1);
    }
  });

  it("returns not-found for an unknown serial", async () => {
    const r = await scanStamp({ merchantId: merchantA, serial: "unknown-serial-xyz", idempotencyKey: "scan-a-2" });
    expect(r.found).toBe(false);
  });

  it("cannot stamp another merchant's card (RLS isolation)", async () => {
    const r = await scanStamp({ merchantId: merchantB, serial, idempotencyKey: "scan-b-1" });
    expect(r.found).toBe(false);
  });
});
