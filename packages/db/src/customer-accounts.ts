import { and, desc, eq, sql } from "drizzle-orm";
import { adminDb } from "./client";
import {
  customerAccounts,
  customerIdentities,
  customerSessions,
  customers,
  enrollments,
  loyaltyPrograms,
  merchants,
} from "./schema";

/**
 * Customer-account data helpers. Like auth.ts, these run on the ADMIN path (adminDb, bypassing RLS):
 * customer accounts are GLOBAL (not tenant-scoped), and the cross-merchant "all my cards" read is
 * authorized by the customer's own verified session in the API — never by a merchant. Nothing here
 * is reachable from the RLS-scoped app role.
 */

/** A social identity the API has already verified (Google/Apple ID token → these fields). */
export interface VerifiedIdentity {
  provider: string; // 'google' | 'apple'
  sub: string; // the provider's stable subject id
  email?: string;
  emailVerified: boolean;
}

/**
 * Resolve the account for a verified identity, creating it on first sign-in.
 *   1. known (provider, sub) → return its account (idempotent re-login).
 *   2. else a VERIFIED email matching an existing account → link this identity into it
 *      (so Google + Apple with the same verified email are one person).
 *   3. else a brand-new account.
 * An advisory lock on (provider:sub) serializes a double-tapped first sign-in.
 */
export async function findOrCreateAccountByIdentity(idy: VerifiedIdentity): Promise<string> {
  return adminDb.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${idy.provider}:${idy.sub}`}))`);

    const [ident] = await tx
      .select({ accountId: customerIdentities.customerAccountId })
      .from(customerIdentities)
      .where(and(eq(customerIdentities.provider, idy.provider), eq(customerIdentities.providerSub, idy.sub)))
      .limit(1);
    if (ident) return ident.accountId;

    // Link by email ONLY when the provider vouches it's verified — otherwise a spoofed email
    // could hijack someone else's account.
    let accountId: string | undefined;
    if (idy.emailVerified && idy.email) {
      const [acc] = await tx
        .select({ id: customerAccounts.id })
        .from(customerAccounts)
        .where(sql`lower(${customerAccounts.email}) = lower(${idy.email})`)
        .limit(1);
      accountId = acc?.id;
    }
    if (!accountId) {
      // Only a VERIFIED email becomes the account's canonical email — it's what future linking trusts
      // and what the unique index enforces. An unverified email lives on the identity row only, so it
      // neither squats the unique slot nor collides with a real account.
      const [acc] = await tx
        .insert(customerAccounts)
        .values({ email: idy.emailVerified ? (idy.email ?? null) : null })
        .returning({ id: customerAccounts.id });
      accountId = acc!.id;
    }
    await tx.insert(customerIdentities).values({
      customerAccountId: accountId,
      provider: idy.provider,
      providerSub: idy.sub,
      email: idy.email ?? null,
    });
    return accountId;
  });
}

export async function createCustomerSession(input: {
  accountId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  device?: string;
}): Promise<void> {
  await adminDb.insert(customerSessions).values({
    customerAccountId: input.accountId,
    refreshTokenHash: input.refreshTokenHash,
    expiresAt: input.expiresAt,
    device: input.device ?? null,
  });
}

/**
 * Atomically consume a refresh session for rotation: lock the row, reject if missing / revoked /
 * expired, otherwise revoke it and return its account. `for update` serializes concurrent refreshes
 * so a token can't be rotated twice.
 */
export async function consumeRefreshSession(refreshTokenHash: string): Promise<string | null> {
  return adminDb.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(customerSessions)
      .where(eq(customerSessions.refreshTokenHash, refreshTokenHash))
      .limit(1)
      .for("update");
    if (!s || s.revokedAt || s.expiresAt.getTime() < Date.now()) return null;
    await tx.update(customerSessions).set({ revokedAt: new Date() }).where(eq(customerSessions.id, s.id));
    return s.customerAccountId;
  });
}

export async function revokeRefreshSession(refreshTokenHash: string): Promise<void> {
  await adminDb
    .update(customerSessions)
    .set({ revokedAt: new Date() })
    .where(eq(customerSessions.refreshTokenHash, refreshTokenHash));
}

/**
 * What claiming a card came to:
 * - claimed — it is this account's card now (or already was);
 * - refused — no such card, or it belongs to a different account;
 * - has_own — the account already holds its own card of this programme, so this one can't join it.
 */
export type ClaimOutcome = "claimed" | "refused" | "has_own";

/**
 * Fold an anonymous (walk-in) card into a signed-in account, by its serial — the bridge for the
 * hybrid UX (get an instant card, then sign in to save it). Possession of the unguessable serial is
 * the credential. Refuses a card already owned by a DIFFERENT account (no stealing); a no-op if it's
 * already this account's.
 */
export async function claimCardBySerial(accountId: string, serial: string): Promise<ClaimOutcome> {
  return adminDb.transaction(async (tx) => {
    const [e] = await tx
      .select({ id: enrollments.id, customerId: enrollments.customerId, programId: enrollments.programId })
      .from(enrollments)
      .where(eq(enrollments.cardSerial, serial))
      .limit(1);
    if (!e) return "refused";
    const [c] = await tx
      .select({ id: customers.id, merchantId: customers.merchantId, accountId: customers.customerAccountId })
      .from(customers)
      .where(eq(customers.id, e.customerId))
      .limit(1)
      .for("update");
    if (!c) return "refused";
    // already linked — mine (ok) or someone else's (refuse)
    if (c.accountId) return c.accountId === accountId ? "claimed" : "refused";

    /*
     * A person is one customer per shop, so an account that is already a customer here can't link
     * this card's customer row as well — that would break the rule (and used to fail as a 500 on
     * every sign-in). A shop runs one card of each type, though, so the account may hold this shop's
     * stamp card while this is its points card: then the card moves onto the account's own row, and
     * the walk-in row it came with goes once it holds nothing. Only a second card of the SAME
     * programme stays put — merging two cards' stamps is a policy not yet settled — unclaimed, and
     * still on the device that holds it.
     */
    const [own] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.merchantId, c.merchantId), eq(customers.customerAccountId, accountId)))
      .limit(1)
      .for("update"); // two of this person's cards claimed at once must not both move in
    if (!own) {
      await tx.update(customers).set({ customerAccountId: accountId }).where(eq(customers.id, c.id));
      return "claimed";
    }

    const [same] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.customerId, own.id), eq(enrollments.programId, e.programId)))
      .limit(1);
    if (same) return "has_own";

    await tx.update(enrollments).set({ customerId: own.id }).where(eq(enrollments.id, e.id));
    const [left] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(eq(enrollments.customerId, c.id))
      .limit(1);
    if (!left) await tx.delete(customers).where(eq(customers.id, c.id));
    return "claimed";
  });
}

/** The account's email — read via adminDb so enroll can snapshot it onto the merchant's customer row. */
export async function getAccountEmail(accountId: string): Promise<string | null> {
  const [a] = await adminDb
    .select({ email: customerAccounts.email })
    .from(customerAccounts)
    .where(eq(customerAccounts.id, accountId))
    .limit(1);
  return a?.email ?? null;
}

export interface MyCard {
  serial: string;
  /** Lets the app spot that it already holds this shop's card when the counter QR is scanned again. */
  programId: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  cardDesign: unknown;
  status: string;
  /** The shop turned this card's type off: it collects nothing more, but what it holds can be used. */
  frozen: boolean;
}

/**
 * The deliberate CROSS-MERCHANT read: every active card belonging to this person, across all shops —
 * frozen ones included, since what they hold is still the customer's to use.
 * adminDb bypasses RLS on purpose — authorization is the customer's own session (checked upstream),
 * so only the signed-in person sees their aggregate; merchant dashboards stay RLS-isolated.
 */
export async function getMyCards(accountId: string): Promise<MyCard[]> {
  const rows = await adminDb
    .select({
      serial: enrollments.cardSerial,
      programId: enrollments.programId,
      merchantName: merchants.name,
      programName: loyaltyPrograms.name,
      rewardText: loyaltyPrograms.rewardText,
      currentStamps: enrollments.currentProgress,
      stampsRequired: loyaltyPrograms.stampsRequired,
      cardDesign: loyaltyPrograms.cardDesign,
      status: enrollments.status,
      programStatus: loyaltyPrograms.status,
    })
    .from(customers)
    .innerJoin(enrollments, eq(enrollments.customerId, customers.id))
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .innerJoin(merchants, eq(merchants.id, enrollments.merchantId))
    .where(and(eq(customers.customerAccountId, accountId), eq(enrollments.status, "active")))
    .orderBy(desc(enrollments.createdAt));
  return rows.map(({ programStatus, ...card }) => ({ ...card, frozen: programStatus === "frozen" }));
}
