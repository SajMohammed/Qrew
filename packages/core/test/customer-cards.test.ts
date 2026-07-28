import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminDb,
  closeDb,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
  customerAccounts,
  getMyCards,
  claimCardBySerial,
} from "@qrew/db";
import { enroll, signInWithProvider } from "../src/index";

let merchantId: string;
let programId: string;
const sfx = process.pid.toString(36);
const accountIds = new Set<string>();

async function newAccount(n: number): Promise<string> {
  const { accountId } = await signInWithProvider({
    provider: "google",
    sub: `cards-${sfx}-${n}`,
    email: `cards${n}-${sfx}@ex.com`,
    emailVerified: true,
  });
  accountIds.add(accountId);
  return accountId;
}

beforeAll(async () => {
  const [m] = await adminDb.insert(merchants).values({ name: "Cards Co", slug: `crd-${sfx}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 5, bonusStamps: 0 })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades customers + enrollments
  if (accountIds.size) await adminDb.delete(customerAccounts).where(inArray(customerAccounts.id, [...accountIds]));
  await closeDb();
});

describe("customer cards — enroll linking + claim", () => {
  it("a signed-in enrollment appears in the account's cards; an anonymous one does not", async () => {
    const accountId = await newAccount(1);
    const signedIn = await enroll({ merchantId, programId, customerAccountId: accountId });
    const anon = await enroll({ merchantId, programId, phone: `+9715${sfx}0001` });

    const serials = (await getMyCards(accountId)).map((c) => c.serial);
    expect(serials).toContain(signedIn.serial);
    expect(serials).not.toContain(anon.serial);
    const card = (await getMyCards(accountId)).find((c) => c.serial === signedIn.serial);
    expect(card?.merchantName).toBe("Cards Co");
  });

  it("re-enrolling while signed in is idempotent — one card in the account", async () => {
    const accountId = await newAccount(2);
    const a = await enroll({ merchantId, programId, customerAccountId: accountId });
    const b = await enroll({ merchantId, programId, customerAccountId: accountId });
    expect(b.serial).toBe(a.serial);
    expect(b.alreadyEnrolled).toBe(true);
    expect((await getMyCards(accountId)).filter((c) => c.serial === a.serial)).toHaveLength(1);
  });

  it("claim folds an anonymous card into the account; another account can't steal it", async () => {
    const accountId = await newAccount(3);
    const other = await newAccount(4);
    const anon = await enroll({ merchantId, programId, phone: `+9715${sfx}0003` });

    expect((await getMyCards(accountId)).map((c) => c.serial)).not.toContain(anon.serial);
    expect(await claimCardBySerial(accountId, anon.serial)).toBe(true);
    expect((await getMyCards(accountId)).map((c) => c.serial)).toContain(anon.serial);

    expect(await claimCardBySerial(other, anon.serial)).toBe(false); // already owned — refused
    expect(await claimCardBySerial(accountId, anon.serial)).toBe(true); // idempotent for the owner
  });

  // Security regression (S2): a signed-in caller must not reach another person's row via a phone
  // number. Enroll is keyed strictly by account; phone is not a trust boundary for signed-in callers.
  it("a signed-in enroll cannot bind to another person's row via phone (no hijack or disclosure)", async () => {
    const victimPhone = `+97155${sfx}victim`;
    const victim = await enroll({ merchantId, programId, phone: victimPhone }); // anonymous victim card
    const attacker = await newAccount(9);

    // attacker signs in and supplies the VICTIM's phone
    const res = await enroll({ merchantId, programId, phone: victimPhone, customerAccountId: attacker });

    // (1) attacker gets their OWN new card — never the victim's serial (no disclosure)
    expect(res.serial).not.toBe(victim.serial);
    expect(res.alreadyEnrolled).toBe(false);

    // (2) the victim's row is NOT hijacked — still anonymous (account id null), still claimable by
    //     whoever actually holds the serial
    const [vEnr] = await adminDb
      .select({ customerId: enrollments.customerId })
      .from(enrollments)
      .where(eq(enrollments.cardSerial, victim.serial));
    const [vCust] = await adminDb
      .select({ accountId: customers.customerAccountId })
      .from(customers)
      .where(eq(customers.id, vEnr!.customerId));
    expect(vCust!.accountId).toBeNull();
  });
});
