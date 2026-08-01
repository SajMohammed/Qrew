import { and, eq, sql } from "drizzle-orm";
import { withTenant, loyaltyPrograms, enrollments, loyaltyProgressEvents, redemptions } from "@qrew/db";
import { cardTypeModule } from "./card-types";
import { enqueueWalletSync } from "@qrew/queue";
import { NotFoundError } from "./errors";

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
 *      resets current_progress.
 *   4. enqueue a wallet-sync job — the wallet-worker resets the pass off the request path.
 */
export async function redeem(input: RedeemInput): Promise<RedeemResult> {
  const outcome = await withTenant(input.merchantId, async (db) => {
    // Lock the card row so two simultaneous redeems serialize — otherwise both pass the ledger
    // eligibility check on a stale snapshot and both spend, double-issuing the reward and driving
    // the balance negative. The second redeem then blocks, re-reads balance 0, and returns insufficient.
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, input.enrollmentId))
      .for("update");
    if (!enrollment) throw new NotFoundError("enrollment not found");
    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, enrollment.programId));
    if (!program) throw new NotFoundError("program not found");

    // idempotent: already redeemed with this key?
    const [existing] = await db
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.merchantId, input.merchantId), eq(redemptions.idempotencyKey, input.idempotencyKey)));
    if (existing) {
      return { redeemed: true, reason: "duplicate" as RedeemReason, enrollment, currentStamps: enrollment.currentProgress, rewardText: existing.rewardText };
    }

    // verify at the money moment: recompute the balance from the ledger, don't trust the cache
    const [sumRow] = await db
      .select({ total: sql<number>`coalesce(sum(${loyaltyProgressEvents.delta}), 0)` })
      .from(loyaltyProgressEvents)
      .where(eq(loyaltyProgressEvents.enrollmentId, input.enrollmentId));
    const balance = Number(sumRow?.total ?? 0);
    if (!cardTypeModule(program.type).redeemable(balance, program.stampsRequired, {} as never)) {
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
    await db.insert(loyaltyProgressEvents).values({
      merchantId: input.merchantId,
      enrollmentId: input.enrollmentId,
      staffId: input.staffId,
      delta: -program.stampsRequired,
      source: "redemption",
      idempotencyKey: `redeem:${input.idempotencyKey}`,
    });

    const [after] = await db
      .select({ currentStamps: enrollments.currentProgress })
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

  // Wallet propagation runs off the request path (see apps/wallet-worker). Best-effort: the
  // redemption is already committed, so a queue outage must not fail the customer's reward.
  if (
    outcome.redeemed &&
    outcome.reason === "redeemed" &&
    (outcome.enrollment.applePassId || outcome.enrollment.googleObjectId)
  ) {
    try {
      await enqueueWalletSync({
        merchantId: input.merchantId,
        enrollmentId: input.enrollmentId,
        kind: "redeem",
      });
    } catch (err) {
      console.error("[wallet] enqueue failed (redemption committed; pass will sync late):", err);
    }
  }

  return {
    redeemed: outcome.redeemed,
    reason: outcome.reason,
    currentStamps: outcome.currentStamps,
    rewardText: outcome.rewardText,
  };
}
