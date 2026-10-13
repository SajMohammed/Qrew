import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { adminDb, closeDb, merchants } from "@qrew/db";
import {
  addStaffPin,
  verifyStaffPin,
  setStaffPin,
  removeStaff,
  resolveStaffToken,
  mintStaffToken,
  verifyStaffToken,
  TooManyAttemptsError,
} from "../src/index";

const merchantIds: string[] = [];
const sfx = process.pid.toString(36);

/** A fresh shop per test: PIN lockouts are counted per shop, so tests mustn't share one. */
async function shop(name: string): Promise<string> {
  const [m] = await adminDb
    .insert(merchants)
    .values({ name, slug: `pin-${merchantIds.length}-${sfx}` })
    .returning();
  merchantIds.push(m!.id);
  return m!.id;
}

afterAll(async () => {
  await adminDb.delete(merchants).where(inArray(merchants.id, merchantIds)); // cascades staff
  await closeDb();
});

describe("staff PINs + tokens", () => {
  let merchantId: string;
  beforeAll(async () => {
    merchantId = await shop("Pin Co");
  });

  it("verifies a correct PIN and rejects a wrong one", async () => {
    const created = await addStaffPin(merchantId, { name: "Aya", pin: "4821", role: "cashier" });
    const ok = await verifyStaffPin(merchantId, "4821");
    expect(ok?.staffId).toBe(created.staffId);
    expect(ok?.role).toBe("cashier");
    expect(await verifyStaffPin(merchantId, "0000")).toBeNull();
  });

  it("issues a shift token that attributes scans in this shop", async () => {
    const { staffId, staffToken } = (await verifyStaffPin(merchantId, "4821"))!;
    expect(await resolveStaffToken(merchantId, staffToken)).toBe(staffId);
  });

  it("refuses a token in any other shop", async () => {
    const other = await shop("Other Co");
    const { staffToken } = (await verifyStaffPin(merchantId, "4821"))!;
    expect(await resolveStaffToken(other, staffToken)).toBeNull();
  });

  it("revokes a token when the PIN is reset", async () => {
    const { staffId, staffToken } = (await verifyStaffPin(merchantId, "4821"))!;
    await setStaffPin(merchantId, staffId, "4822");
    expect(await resolveStaffToken(merchantId, staffToken)).toBeNull();
    const fresh = (await verifyStaffPin(merchantId, "4822"))!;
    expect(await resolveStaffToken(merchantId, fresh.staffToken)).toBe(staffId);
  });

  it("revokes a token when the person is removed", async () => {
    const { staffId } = await addStaffPin(merchantId, { name: "Leaver", pin: "7310" });
    const { staffToken } = (await verifyStaffPin(merchantId, "7310"))!;
    await removeStaff(merchantId, staffId);
    expect(await resolveStaffToken(merchantId, staffToken)).toBeNull();
  });

  it("rejects a tampered token, and one in the old staff-id-only format", () => {
    const token = mintStaffToken({ merchantId, staffId: "s1", pinTag: "t1" });
    expect(verifyStaffToken(token)).toEqual({ merchantId, staffId: "s1", pinTag: "t1" });
    expect(verifyStaffToken(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(verifyStaffToken("garbage.token")).toBeNull();
  });
});

describe("guessing PINs", () => {
  it("pauses PIN entry for the shop after 5 wrong PINs — even for the right one", async () => {
    const merchantId = await shop("Locked Co");
    await addStaffPin(merchantId, { name: "Sam", pin: "2468" });
    for (const wrong of ["1111", "2222", "3333", "4444", "5555"]) {
      expect(await verifyStaffPin(merchantId, wrong)).toBeNull();
    }

    const paused = verifyStaffPin(merchantId, "2468");
    await expect(paused).rejects.toBeInstanceOf(TooManyAttemptsError);
    await expect(verifyStaffPin(merchantId, "2468")).rejects.toMatchObject({
      code: "pin_locked",
      message: expect.stringMatching(/paused for 15 minutes/),
    });
  });

  it("does not let a correct PIN wipe the count of wrong ones", async () => {
    const merchantId = await shop("Mixer Co");
    await addStaffPin(merchantId, { name: "Ali", pin: "1357" });
    for (let i = 0; i < 4; i++) {
      expect(await verifyStaffPin(merchantId, "9999")).toBeNull();
      expect(await verifyStaffPin(merchantId, "1357")).not.toBeNull(); // interleaved
    }
    expect(await verifyStaffPin(merchantId, "9999")).toBeNull(); // the 5th miss
    await expect(verifyStaffPin(merchantId, "1357")).rejects.toBeInstanceOf(TooManyAttemptsError);
  });

  // Checks used to run side by side, each passing the gate before any had missed — so a burst of
  // guesses sent at once was tried in full, the right PIN included, and the shop locked only after.
  it("holds a burst of guesses sent at once to the same limit", async () => {
    const merchantId = await shop("Burst Co");
    await addStaffPin(merchantId, { name: "Rami", pin: "8080" });
    const guesses = ["1001", "1002", "1003", "1004", "1005", "1006", "1007", "1008", "8080"];
    const results = await Promise.allSettled(guesses.map((pin) => verifyStaffPin(merchantId, pin)));
    expect(results.filter((r) => r.status === "fulfilled" && r.value === null)).toHaveLength(5);
    const last = results.at(-1)!;
    expect(last.status === "rejected" && last.reason instanceof TooManyAttemptsError).toBe(true);
  });

  it("keeps other shops unaffected", async () => {
    const merchantId = await shop("Calm Co");
    await addStaffPin(merchantId, { name: "Noor", pin: "8642" });
    expect(await verifyStaffPin(merchantId, "8642")).not.toBeNull();
  });
});

describe("unique PINs", () => {
  it("refuses a PIN someone on the team already has, on add and on reset", async () => {
    const merchantId = await shop("Unique Co");
    await addStaffPin(merchantId, { name: "One", pin: "5050" });
    const two = await addStaffPin(merchantId, { name: "Two", pin: "6060" });

    await expect(addStaffPin(merchantId, { name: "Three", pin: "5050" })).rejects.toThrow(/already used/);
    await expect(setStaffPin(merchantId, two.staffId, "5050")).rejects.toThrow(/already used/);
    // Re-saving your own PIN is not a clash.
    await expect(setStaffPin(merchantId, two.staffId, "6060")).resolves.toMatchObject({ hasPin: true });
  });

  it("only compares within the shop", async () => {
    const a = await shop("A Co");
    const b = await shop("B Co");
    await addStaffPin(a, { name: "A", pin: "9090" });
    await expect(addStaffPin(b, { name: "B", pin: "9090" })).resolves.toMatchObject({ name: "B" });
  });
});
