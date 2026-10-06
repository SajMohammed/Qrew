import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql, type SQL } from "drizzle-orm";
import {
  adminDb,
  appDb,
  withTenant,
  closeDb,
  assertAppRoleIsolated,
  merchants,
  locations,
  staff,
  loyaltyPrograms,
  customers,
  enrollments,
  loyaltyProgressEvents,
  redemptions,
  merchantAssets,
  leads,
  customerAccounts,
  customerIdentities,
  customerSessions,
} from "../src/index";

/** Every table that carries a tenant, with the column its policy filters on. */
const TENANT_TABLES = [
  ["merchants", "id"],
  ["locations", "merchant_id"],
  ["staff", "merchant_id"],
  ["loyalty_programs", "merchant_id"],
  ["customers", "merchant_id"],
  ["enrollments", "merchant_id"],
  ["loyalty_progress_events", "merchant_id"],
  ["redemptions", "merchant_id"],
  ["merchant_assets", "merchant_id"],
] as const;

/** Global tables reached only through the admin path: no policy, so the app role sees nothing. */
const GLOBAL_TABLES = ["leads", "customer_accounts", "customer_identities", "customer_sessions"] as const;

let leadId: string;
let accountId: string;

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
  const [bProgram] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId: merchantB, name: "B Card" })
    .returning();

  // Give tenant B a row in every tenant table, so "A sees none of B's rows" is tested against
  // rows that exist rather than an empty table.
  await adminDb.insert(locations).values({ merchantId: merchantB, name: "B Shop" });
  await adminDb.insert(staff).values({ merchantId: merchantB, name: "B Cashier" });
  const [bCustomer] = await adminDb.insert(customers).values({ merchantId: merchantB }).returning();
  const [bCard] = await adminDb
    .insert(enrollments)
    .values({ merchantId: merchantB, programId: bProgram!.id, customerId: bCustomer!.id, cardSerial: `rls-${s}` })
    .returning();
  await adminDb
    .insert(loyaltyProgressEvents)
    .values({ merchantId: merchantB, enrollmentId: bCard!.id, idempotencyKey: `rls-${s}` });
  await adminDb.insert(redemptions).values({
    merchantId: merchantB,
    enrollmentId: bCard!.id,
    rewardText: "B reward",
    stampsSpent: 1,
    idempotencyKey: `rls-${s}`,
  });
  await adminDb
    .insert(merchantAssets)
    .values({ merchantId: merchantB, kind: "logo", bytes: Buffer.from([0]), width: 1, height: 1 });

  // And one row in every global table.
  const [lead] = await adminDb
    .insert(leads)
    .values({ businessName: "RLS Lead", email: `rls-${s}@example.com` })
    .returning();
  leadId = lead!.id;
  const [account] = await adminDb.insert(customerAccounts).values({ email: `rls-${s}@example.com` }).returning();
  accountId = account!.id;
  await adminDb
    .insert(customerIdentities)
    .values({ customerAccountId: accountId, provider: "google", providerSub: `rls-${s}` });
  await adminDb.insert(customerSessions).values({
    customerAccountId: accountId,
    refreshTokenHash: `rls-${s}`,
    expiresAt: new Date(Date.now() + 60_000),
  });
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantA)); // cascades to every tenant row
  await adminDb.delete(merchants).where(eq(merchants.id, merchantB));
  await adminDb.delete(leads).where(eq(leads.id, leadId));
  await adminDb.delete(customerAccounts).where(eq(customerAccounts.id, accountId)); // cascades
  await closeDb();
});

async function count(db: { execute: (query: SQL) => Promise<unknown> }, query: SQL): Promise<number> {
  const rows = (await db.execute(query)) as unknown as { n: number }[];
  return rows[0]!.n;
}

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

  it("the app connection is not one that bypasses row-level security", async () => {
    await expect(assertAppRoleIsolated()).resolves.toBeUndefined();
  });

  it.each(TENANT_TABLES)("%s: a tenant never sees another tenant's rows", async (table, column) => {
    const query = sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)} = ${merchantB}`;
    // B's row exists — the admin path sees it — so a zero below means hidden, not missing.
    expect(await count(adminDb, query)).toBeGreaterThan(0);
    expect(await withTenant(merchantA, (db) => count(db, query))).toBe(0);
  });

  it.each(GLOBAL_TABLES)("%s: the app role can read nothing", async (table) => {
    const query = sql`select count(*)::int as n from ${sql.identifier(table)}`;
    expect(await count(adminDb, query)).toBeGreaterThan(0);
    expect(await withTenant(merchantA, (db) => count(db, query))).toBe(0);
  });

  it("the app role cannot write a global table", async () => {
    await expect(
      withTenant(merchantA, (db) => db.insert(leads).values({ businessName: "spoof", email: "spoof@example.com" })),
    ).rejects.toThrow();
  });
});
