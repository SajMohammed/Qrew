import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants } from "@qrew/db";
import { addStaffPin, verifyStaffPin, mintStaffToken, verifyStaffToken } from "../src/index";

let merchantId: string;

beforeAll(async () => {
  const [m] = await adminDb
    .insert(merchants)
    .values({ name: "Pin Co", slug: `pin-${process.pid.toString(36)}` })
    .returning();
  merchantId = m!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades staff
  await closeDb();
});

describe("staff PINs + tokens", () => {
  it("verifies a correct PIN and rejects a wrong one", async () => {
    const created = await addStaffPin(merchantId, { name: "Aya", pin: "4821", role: "cashier" });
    const ok = await verifyStaffPin(merchantId, "4821");
    expect(ok?.staffId).toBe(created.staffId);
    expect(ok?.role).toBe("cashier");
    expect(await verifyStaffPin(merchantId, "0000")).toBeNull();
  });

  it("mints + verifies a staff token, rejects a tampered one", () => {
    const token = mintStaffToken("staff_abc");
    expect(verifyStaffToken(token)).toBe("staff_abc");
    expect(verifyStaffToken("garbage.token")).toBeNull();
  });
});
