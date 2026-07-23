import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  adminDb,
  closeDb,
  merchants,
  staff,
  resolveStaffByClerkUser,
  provisionMerchantForOwner,
  invalidateStaffCache,
} from "../src/index";

const userId = `clerk_user_${process.pid.toString(36)}`;
let merchantId: string;

afterAll(async () => {
  if (merchantId) await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades staff
  await closeDb();
});

describe("clerk-user tenancy (flat model)", () => {
  it("provisions a merchant + owner staff row on first login, idempotently", async () => {
    merchantId = await provisionMerchantForOwner({ userId, name: "Test Roasters" });
    expect(merchantId).toBeTruthy();

    // same user again → same merchant, no duplicate merchant/staff row
    const again = await provisionMerchantForOwner({ userId, name: "Test Roasters" });
    expect(again).toBe(merchantId);

    const staffRows = await adminDb.select().from(staff).where(eq(staff.externalAuthId, userId));
    expect(staffRows).toHaveLength(1);
    expect(staffRows[0]?.role).toBe("owner");
  });

  it("resolves a Clerk user to their merchant + role", async () => {
    invalidateStaffCache(userId); // bypass the TTL cache for a fresh read
    const rows = await resolveStaffByClerkUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.merchantId).toBe(merchantId);
    expect(rows[0]?.role).toBe("owner");
  });

  it("returns [] for an unknown user", async () => {
    const rows = await resolveStaffByClerkUser("clerk_user_nobody_here");
    expect(rows).toHaveLength(0);
  });
});
