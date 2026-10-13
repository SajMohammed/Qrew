import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms, customers, enrollments } from "../src/index";

/**
 * A card's short code (migration 0014): drawn by the database, unique within a shop, and only ever
 * from the alphabet with no look-alikes — so whatever a cashier reads off a card, they can type.
 */
const merchantIds: string[] = [];
const sfx = process.pid.toString(36);

async function shop(tag: string) {
  const [m] = await adminDb.insert(merchants).values({ name: `Code ${tag}`, slug: `code-${tag}-${sfx}` }).returning();
  merchantIds.push(m!.id);
  const [p] = await adminDb.insert(loyaltyPrograms).values({ merchantId: m!.id, name: "Card" }).returning();
  return { merchantId: m!.id, programId: p!.id };
}

async function card(s: { merchantId: string; programId: string }, shortCode?: string) {
  const [c] = await adminDb.insert(customers).values({ merchantId: s.merchantId }).returning();
  const [e] = await adminDb
    .insert(enrollments)
    .values({
      merchantId: s.merchantId,
      programId: s.programId,
      customerId: c!.id,
      cardSerial: `code-${crypto.randomUUID()}`,
      ...(shortCode ? { shortCode } : {}),
    })
    .returning();
  return e!;
}

let a: { merchantId: string; programId: string };
let b: { merchantId: string; programId: string };

beforeAll(async () => {
  a = await shop("a");
  b = await shop("b");
});

afterAll(async () => {
  await adminDb.delete(merchants).where(inArray(merchants.id, merchantIds)); // cascades
  await closeDb();
});

describe("card short codes", () => {
  it("draws only from the alphabet with no look-alikes", async () => {
    const rows = await adminDb.execute<{ code: string }>(
      sql`select qrew_short_code() as code from generate_series(1, 500)`,
    );
    for (const { code } of rows) expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
  });

  it("gives a card inserted without one a code of its own", async () => {
    const e = await card(a);
    expect(e.shortCode).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
  });

  it("refuses a code already taken in the same shop", async () => {
    const e = await card(a);
    await expect(card(a, e.shortCode)).rejects.toThrow();
  });

  it("lets two shops share a code", async () => {
    const e = await card(a);
    const other = await card(b, e.shortCode);
    expect(other.shortCode).toBe(e.shortCode);
  });

  it("refuses lower case and look-alike characters", async () => {
    await expect(card(a, "abcdef")).rejects.toThrow();
    await expect(card(a, "ABC0OI")).rejects.toThrow();
    const [stored] = await adminDb.select().from(enrollments).where(eq(enrollments.shortCode, "ABC0OI"));
    expect(stored).toBeUndefined();
  });
});
