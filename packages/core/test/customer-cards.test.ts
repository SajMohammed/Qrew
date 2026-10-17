import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
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
// The same shop's second card: a shop runs one card of each type.
let pointsProgramId: string;
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
  const [pts] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Points", type: "points", stampsRequired: 500, bonusStamps: 0 })
    .returning();
  pointsProgramId = pts!.id;
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
    expect(await claimCardBySerial(accountId, anon.serial)).toBe("claimed");
    const mine = (await getMyCards(accountId)).find((c) => c.serial === anon.serial);
    expect(mine?.programId).toBe(programId);

    expect(await claimCardBySerial(other, anon.serial)).toBe("refused"); // already owned — refused
    expect(await claimCardBySerial(accountId, anon.serial)).toBe("claimed"); // idempotent for the owner
  });

  // An account holds one card per programme. A second, anonymous one of the same programme used to
  // break the unique index and answer 500 on every sign-in; now it is declined and left as it was.
  it("declines a second card of a programme the account already holds, leaving it untouched", async () => {
    const accountId = await newAccount(5);
    await enroll({ merchantId, programId, customerAccountId: accountId });
    const anon = await enroll({ merchantId, programId, phone: `+9715${sfx}0005` });

    expect(await claimCardBySerial(accountId, anon.serial)).toBe("has_own");
    expect((await getMyCards(accountId)).map((c) => c.serial)).not.toContain(anon.serial);
    const [row] = await adminDb
      .select({ accountId: customers.customerAccountId })
      .from(customers)
      .innerJoin(enrollments, eq(enrollments.customerId, customers.id))
      .where(eq(enrollments.cardSerial, anon.serial));
    expect(row?.accountId).toBeNull();
  });

  /*
   * A shop runs a card per type, and a walk-in who took both and then signed in arrives with two
   * anonymous cards from one shop, each on its own customer row. The second can't link its row (the
   * account is already a customer there), so the card itself moves onto the account's row — and the
   * walk-in row, now holding nothing, goes rather than counting as a second customer.
   */
  it("claims a second card from the same shop onto the account's own customer row", async () => {
    const accountId = await newAccount(6);
    const stamp = await enroll({ merchantId, programId });
    const points = await enroll({ merchantId, programId: pointsProgramId });
    const [walkInCard] = await adminDb
      .select({ customerId: enrollments.customerId })
      .from(enrollments)
      .where(eq(enrollments.cardSerial, points.serial));

    expect(await claimCardBySerial(accountId, stamp.serial)).toBe("claimed");
    expect(await claimCardBySerial(accountId, points.serial)).toBe("claimed");
    expect(await claimCardBySerial(accountId, points.serial)).toBe("claimed"); // a retry stays a no-op

    const mine = await getMyCards(accountId);
    expect(mine.map((c) => c.serial).sort()).toEqual([stamp.serial, points.serial].sort());
    const holders = await adminDb
      .selectDistinct({ customerId: enrollments.customerId })
      .from(enrollments)
      .where(inArray(enrollments.cardSerial, [stamp.serial, points.serial]));
    expect(holders).toHaveLength(1);
    const [walkIn] = await adminDb.select().from(customers).where(eq(customers.id, walkInCard!.customerId));
    expect(walkIn).toBeUndefined();
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

  // A signed-in customer's account email is snapshotted onto the merchant's row, so the dashboard
  // shows who enrolled instead of "Guest".
  it("captures the signed-in customer's account email onto the merchant row", async () => {
    const email = `whoami-${sfx}@ex.com`;
    const { accountId } = await signInWithProvider({ provider: "google", sub: `who-${sfx}`, email, emailVerified: true });
    accountIds.add(accountId);
    await enroll({ merchantId, programId, customerAccountId: accountId });

    const [cust] = await adminDb
      .select({ email: customers.email })
      .from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.customerAccountId, accountId)));
    expect(cust!.email).toBe(email);
  });
});
