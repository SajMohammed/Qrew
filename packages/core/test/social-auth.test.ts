import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { adminDb, closeDb, customerAccounts, customerIdentities } from "@qrew/db";
import { signInWithProvider, refreshSession, logout, verifyCustomerToken } from "../src/index";

// Unit-tests the account/session core with an ALREADY-verified identity (the API verifies the real
// Google/Apple token upstream), so there's no network here — just db + token logic.
const sfx = process.pid.toString(36);
const accountIds = new Set<string>();
const track = (id: string): string => {
  accountIds.add(id);
  return id;
};

afterAll(async () => {
  if (accountIds.size) {
    await adminDb.delete(customerAccounts).where(inArray(customerAccounts.id, [...accountIds])); // cascades identities + sessions
  }
  await closeDb();
});

describe("customer social auth", () => {
  it("first sign-in creates an account + identity + a working access token", async () => {
    const t = await signInWithProvider({
      provider: "google",
      sub: `g-${sfx}-1`,
      email: `first-${sfx}@example.com`,
      emailVerified: true,
    });
    track(t.accountId);
    expect(t.accountId).toBeTruthy();
    expect(verifyCustomerToken(t.accessToken)).toBe(t.accountId); // the Bearer resolves to this account
    expect(t.refreshToken).toBeTruthy();

    const idents = await adminDb
      .select()
      .from(customerIdentities)
      .where(eq(customerIdentities.customerAccountId, t.accountId));
    expect(idents).toHaveLength(1);
    expect(idents[0]!.provider).toBe("google");
  });

  it("re-login with the same provider identity returns the same account", async () => {
    const idy = { provider: "google", sub: `g-${sfx}-2`, email: `dup-${sfx}@example.com`, emailVerified: true };
    const a = track((await signInWithProvider(idy)).accountId);
    const b = track((await signInWithProvider(idy)).accountId);
    expect(b).toBe(a);
  });

  it("a second provider with the same VERIFIED email links into one account", async () => {
    const email = `shared-${sfx}@example.com`;
    const g = track((await signInWithProvider({ provider: "google", sub: `g-${sfx}-3`, email, emailVerified: true })).accountId);
    const ap = track((await signInWithProvider({ provider: "apple", sub: `a-${sfx}-3`, email, emailVerified: true })).accountId);
    expect(ap).toBe(g);
    const idents = await adminDb.select().from(customerIdentities).where(eq(customerIdentities.customerAccountId, g));
    expect(idents.map((i) => i.provider).sort()).toEqual(["apple", "google"]);
  });

  it("an UNVERIFIED matching email does NOT link — no account takeover", async () => {
    const email = `unverified-${sfx}@example.com`;
    const g = track((await signInWithProvider({ provider: "google", sub: `g-${sfx}-4`, email, emailVerified: true })).accountId);
    const bad = track((await signInWithProvider({ provider: "apple", sub: `a-${sfx}-4`, email, emailVerified: false })).accountId);
    expect(bad).not.toBe(g);
  });

  it("refresh rotates: the old refresh token stops working, the new one works", async () => {
    const t = await signInWithProvider({ provider: "google", sub: `g-${sfx}-5`, email: `rot-${sfx}@example.com`, emailVerified: true });
    track(t.accountId);

    const rotated = await refreshSession(t.refreshToken);
    expect(rotated).not.toBeNull();
    expect(rotated!.accountId).toBe(t.accountId);
    expect(verifyCustomerToken(rotated!.accessToken)).toBe(t.accountId);

    expect(await refreshSession(t.refreshToken)).toBeNull(); // single-use — already consumed
    expect(await refreshSession(rotated!.refreshToken)).not.toBeNull(); // the fresh one still works
  });

  it("logout revokes the refresh token", async () => {
    const t = await signInWithProvider({ provider: "google", sub: `g-${sfx}-6`, email: `out-${sfx}@example.com`, emailVerified: true });
    track(t.accountId);
    await logout(t.refreshToken);
    expect(await refreshSession(t.refreshToken)).toBeNull();
  });
});
