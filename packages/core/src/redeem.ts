import { and, eq, sql } from "drizzle-orm";
import { withTenant, loyaltyPrograms, enrollments, stampEvents, redemptions } from "@qrew/db";
import { getWalletProvider } from "@qrew/wallet-core";

export interface RedeemInput {
  merchantId: string;
  enrollmentId: string;
  idempotencyKey: string;
  staffId?: string;
}

export type RedeemReason = "redeemed" | "insufficient" | "duplicate";

export interface RedeemResult {
  redeemed: boolean;
  reason: RedeemReason;
  currentStamps: number;
  rewardText?: string;
}

/**
 * Redeem a reward — the "money moment", so correctness is verified against the ledger,
 * not the cached projection:
 *   1. idempotent: a repeat with the same key returns the prior result, never double-spends.
 *   2. VERIFY eligibility by recomputing sum(delta) FROM THE LEDGER (source of truth).
 *   3. append a `redemptions` record + a compensating negative stamp_event; the trigger
 *      resets current_stamps.
 *   4. sync the wallet pass outside the transaction.
 */
export async function redeem(input: RedeemInput): Promise<RedeemResult> {
  const provider = getWalletProvider();

  const outcome = await withTenant(input.merchantId, async (db) => {
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId));
    if (!enrollment) throw new Error("enrollment not found");
    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, enrollment.programId));
    if (!program) throw new Error("program not found");

    // idempotent: already redeemed with this key?
    const [existing] = await db
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.merchantId, input.merchantId), eq(redemptions.idempotencyKey, input.idempotencyKey)));
    if (existing) {
      return { redeemed: true, reason: "duplicate" as RedeemReason, enrollment, currentStamps: enrollment.currentStamps, rewardText: existing.rewardText };
    }

    // verify at the money moment: recompute the balance from the ledger, don't trust the cache
    const [sumRow] = await db
      .select({ total: sql<number>`coalesce(sum(${stampEvents.delta}), 0)` })
      .from(stampEvents)
      .where(eq(stampEvents.enrollmentId, input.enrollmentId));
    const balance = Number(sumRow?.total ?? 0);
    if (balance < program.stampsRequired) {
      return { redeemed: false, reason: "insufficient" as RedeemReason, enrollment, currentStamps: balance, rewardText: undefined };
    }

    // record the redemption + compensating negative ledger event (trigger resets the projection)
    await db.insert(redemptions).values({
      merchantId: input.merchantId,
      enrollmentId: input.enrollmentId,
      staffId: input.staffId,
      rewardText: program.rewardText,
      stampsSpent: program.stampsRequired,
      idempotencyKey: input.idempotencyKey,
    });
    await db.insert(stampEvents).values({
      merchantId: input.merchantId,
      enrollmentId: input.enrollmentId,
      staffId: input.staffId,
      delta: -program.stampsRequired,
      source: "redemption",
      idempotencyKey: `redeem:${input.idempotencyKey}`,
    });

    const [after] = await db
      .select({ currentStamps: enrollments.currentStamps })
      .from(enrollments)
      .where(eq(enrollments.id, input.enrollmentId));

    return {
      redeemed: true,
      reason: "redeemed" as RedeemReason,
      enrollment,
      currentStamps: after?.currentStamps ?? balance - program.stampsRequired,
      rewardText: program.rewardText,
    };
  });

  // sync the wallet pass outside the tx (TODO(2.5): enqueue a BullMQ job)
  if (
    outcome.redeemed &&
    outcome.reason === "redeemed" &&
    (outcome.enrollment.applePassId || outcome.enrollment.googleObjectId)
  ) {
    const ref = {
      serial: outcome.enrollment.cardSerial,
      applePassId: outcome.enrollment.applePassId ?? undefined,
      googleObjectId: outcome.enrollment.googleObjectId ?? undefined,
    };
    await provider.updateStamps(ref, outcome.currentStamps);
    await provider.pushUpdate(ref, "Reward redeemed — see you next time!");
  }

  return {
    redeemed: outcome.redeemed,
    reason: outcome.reason,
    currentStamps: outcome.currentStamps,
    rewardText: outcome.rewardText,
  };
}
