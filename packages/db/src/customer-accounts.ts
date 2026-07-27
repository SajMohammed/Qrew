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

export interface MyCard {
  serial: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  cardDesign: unknown;
  status: string;
}

/**
 * The deliberate CROSS-MERCHANT read: every active card belonging to this person, across all shops.
 * adminDb bypasses RLS on purpose — authorization is the customer's own session (checked upstream),
 * so only the signed-in person sees their aggregate; merchant dashboards stay RLS-isolated.
 */
export async function getMyCards(accountId: string): Promise<MyCard[]> {
  return adminDb
    .select({
      serial: enrollments.cardSerial,
      merchantName: merchants.name,
      programName: loyaltyPrograms.name,
      rewardText: loyaltyPrograms.rewardText,
      currentStamps: enrollments.currentStamps,
      stampsRequired: loyaltyPrograms.stampsRequired,
      cardDesign: loyaltyPrograms.cardDesign,
      status: enrollments.status,
    })
    .from(customers)
    .innerJoin(enrollments, eq(enrollments.customerId, customers.id))
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .innerJoin(merchants, eq(merchants.id, enrollments.merchantId))
    .where(and(eq(customers.customerAccountId, accountId), eq(enrollments.status, "active")))
    .orderBy(desc(enrollments.createdAt));
}
