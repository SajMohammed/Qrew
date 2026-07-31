import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, staff } from "@qrew/db";
import { addStaffPin, listStaff, setStaffPin, removeStaff, verifyStaffPin } from "../src/index";

let merchantId: string;

beforeAll(async () => {
  const [m] = await adminDb
    .insert(merchants)
    .values({ name: "Team Co", slug: `team-${process.pid.toString(36)}` })
    .returning();
  merchantId = m!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades staff
  await closeDb();
});

describe("staff management", () => {
  it("lists the team without ever exposing a PIN hash", async () => {
    await addStaffPin(merchantId, { name: "Aya", pin: "1234", role: "cashier" });

    const team = await listStaff(merchantId);
    const aya = team.find((s) => s.name === "Aya");

    expect(aya?.role).toBe("cashier");
    expect(aya?.hasPin).toBe(true);
    expect(aya?.linkedAccount).toBe(false);
    // The shape must not leak the credential, however the row was selected. Stored PINs look like
    // `<32 hex salt>:<64 hex hash>`, so assert nothing of that shape survives serialisation.
    expect(JSON.stringify(team)).not.toMatch(/[0-9a-f]{32}:[0-9a-f]{64}/);
    expect(Object.keys(aya ?? {}).sort()).toEqual([
      "createdAt",
      "hasPin",
      "id",
      "linkedAccount",
      "name",
      "role",
    ]);
  });

  it("resets a PIN so the old one stops working", async () => {
    const created = await addStaffPin(merchantId, { name: "Bilal", pin: "5555", role: "cashier" });
    expect((await verifyStaffPin(merchantId, "5555"))?.staffId).toBe(created.staffId);

    await setStaffPin(merchantId, created.staffId, "6789");

    expect(await verifyStaffPin(merchantId, "5555")).toBeNull();
    expect((await verifyStaffPin(merchantId, "6789"))?.staffId).toBe(created.staffId);
  });

  it("removes a PIN-only staff member", async () => {
    const created = await addStaffPin(merchantId, { name: "Carla", pin: "2468", role: "cashier" });
    await removeStaff(merchantId, created.staffId);

    expect(await verifyStaffPin(merchantId, "2468")).toBeNull();
    expect((await listStaff(merchantId)).some((s) => s.name === "Carla")).toBe(false);
  });

  it("refuses to remove someone who signs in with their own account", async () => {
    // This row is what maps a Clerk user to the merchant. Deleting it would strand the owner —
    // their next request would read as "needs onboarding" and provision them a fresh, empty shop.
    const [owner] = await adminDb
      .insert(staff)
      .values({ merchantId, name: "Owner", role: "owner", externalAuthId: "user_clerk_123" })
      .returning();

    await expect(removeStaff(merchantId, owner!.id)).rejects.toThrow();

    const team = await listStaff(merchantId);
    const stillThere = team.find((s) => s.id === owner!.id);
    expect(stillThere).toBeTruthy();
    expect(stillThere?.linkedAccount).toBe(true);
    expect(stillThere?.hasPin).toBe(false); // signs in with Clerk, no counter PIN
  });

  it("rejects an unknown staff id rather than silently doing nothing", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    await expect(setStaffPin(merchantId, missing, "1111")).rejects.toThrow();
    await expect(removeStaff(merchantId, missing)).rejects.toThrow();
  });
});
