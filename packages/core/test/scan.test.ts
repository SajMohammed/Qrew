import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { enroll, getCard, mintCardToken, scanStamp } from "../src/index";

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

  it("stamps a card by the signed token in the app's QR", async () => {
    const e = await enroll({ merchantId: merchantA, programId: programA, phone: "+971500000031" });
    const r = await scanStamp({ merchantId: merchantA, serial: mintCardToken(e.serial), idempotencyKey: "scan-tok" });
    expect(r.found && r.enrollmentId).toBe(e.enrollmentId);
  });
});

describe("scanStamp by typed short code", () => {
  let code: string; // as the card shows it, "K7M 4QX"
  let serial: string;

  beforeAll(async () => {
    const e = await enroll({ merchantId: merchantA, programId: programA, phone: "+971500000032" });
    serial = e.serial;
    code = (await getCard(e.serial))!.shortCode;
  });

  it("shows the code as two groups of three from the unambiguous alphabet", () => {
    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{3} [2-9A-HJKMNP-TV-Z]{3}$/);
  });

  it("stamps the card, and says which card it stamped", async () => {
    const r = await scanStamp({ merchantId: merchantA, serial: code, idempotencyKey: "code-1" });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.applied).toBe(true);
      expect(r.shortCode).toBe(code);
    }
  });

  it("forgives case, spacing and a hyphen", async () => {
    const bare = code.replace(" ", "");
    for (const [i, typed] of [bare.toLowerCase(), code.replace(" ", "-")].entries()) {
      const r = await scanStamp({ merchantId: merchantA, serial: typed, idempotencyKey: `code-form-${i}` });
      expect(r.found).toBe(true);
    }
  });

  it("is not found at another shop", async () => {
    const r = await scanStamp({ merchantId: merchantB, serial: code, idempotencyKey: "code-b" });
    expect(r.found).toBe(false);
  });

  it("is not found when malformed, without throwing", async () => {
    for (const typed of ["ABC0OI", "ABCDEFG", "abc"]) {
      const r = await scanStamp({ merchantId: merchantA, serial: typed, idempotencyKey: `code-bad-${typed}` });
      expect(r.found).toBe(false);
    }
  });

  // The serial is the card's bearer secret; six characters are not. The public read must not take them.
  it("does not open the public card read", async () => {
    expect(await getCard(code)).toBeNull();
    expect(await getCard(code.replace(" ", ""))).toBeNull();
    expect(await getCard(serial)).not.toBeNull();
  });
});
