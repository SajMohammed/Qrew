import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, appDb, withTenant, closeDb, merchants, loyaltyPrograms } from "../src/index";

/**
 * The most important test in Phase 1: prove that row-level security actually isolates
 * tenants. Two merchants are created via the ADMIN connection (bypasses RLS); every
 * assertion then goes through the APP connection (`qrew_app`, subject to RLS).
 *
 * If any of these fail, tenant data is leaking — CI must block the merge.
 */
let merchantA: string;
let merchantB: string;

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [a] = await adminDb.insert(merchants).values({ name: "Tenant A", slug: `a-${s}` }).returning();
  const [b] = await adminDb.insert(merchants).values({ name: "Tenant B", slug: `b-${s}` }).returning();
  merchantA = a!.id;
  merchantB = b!.id;
  await adminDb.insert(loyaltyPrograms).values({ merchantId: merchantA, name: "A Card" });
  await adminDb.insert(loyaltyPrograms).values({ merchantId: merchantB, name: "B Card" });
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantA)); // cascades to programs
  await adminDb.delete(merchants).where(eq(merchants.id, merchantB));
  await closeDb();
});

describe("row-level tenant isolation", () => {
  it("a tenant sees only its own programs", async () => {
    const rows = await withTenant(merchantA, (db) => db.select().from(loyaltyPrograms));
    expect(rows.map((r) => r.name)).toEqual(["A Card"]);
    expect(rows.every((r) => r.merchantId === merchantA)).toBe(true);
  });

  it("a tenant cannot read another tenant's row, even by id", async () => {
    const [bProgram] = await adminDb
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.merchantId, merchantB));
    const rows = await withTenant(merchantA, (db) =>
      db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, bProgram!.id)),
    );
    expect(rows).toHaveLength(0);
  });

  it("a tenant cannot insert a row for another tenant (WITH CHECK)", async () => {
    await expect(
      withTenant(merchantA, (db) =>
        db.insert(loyaltyPrograms).values({ merchantId: merchantB, name: "spoof" }),
      ),
    ).rejects.toThrow();
  });

  it("with no tenant set, the app sees nothing", async () => {
    const rows = await appDb.select().from(loyaltyPrograms);
    expect(rows).toHaveLength(0);
  });
});
