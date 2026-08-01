import { and, desc, eq } from "drizzle-orm";
import { withTenant, loyaltyPrograms, enrollments, loyaltyProgressEvents } from "@qrew/db";
import { cardTypeModule } from "./card-types";
import { enqueueWalletSync } from "@qrew/queue";
import { NotFoundError } from "./errors";

export interface AddStampInput {
  merchantId: string;
  enrollmentId: string;
  idempotencyKey: string;
  locationId?: string;
  staffId?: string;
}

export type StampReason =
  | "applied"
  | "duplicate"
  | "cooldown"
  | "reward_ready"
  /** This kind of card does not collect anything — a discount is valid the day it is issued. */
  | "no_accrual";

export interface StampResult {
  applied: boolean;
  reason: StampReason;
  currentStamps: number;
  stampsRequired: number;
  rewardReady: boolean;
}

function cooldownMs(): number {
  return Number(process.env.STAMP_COOLDOWN_SECONDS ?? 2) * 1000;
}

/**
 * Record one stamp:
 *   0. reject if the card is already at the reward threshold — redeem before earning more.
 *   1. cooldown guard — a re-scan of the same card within the window is ignored
 *      (belt-and-suspenders alongside the idempotency key).
 *   2. append to the ledger (idempotent); the DB trigger updates current_progress.
 *   3. enqueue a wallet-sync job — the wallet-worker updates the pass off the request path,
 *      so the cashier never waits on Apple/Google.
 */
export async function addStamp(input: AddStampInput): Promise<StampResult> {
  const outcome = await withTenant(input.merchantId, async (db) => {
    // Lock the card row so two simultaneous scans serialize — otherwise both read a stale count and
    // both stamp, pushing current_progress past the cap (and past the cooldown).
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

    const card = cardTypeModule(program.type);
    const mechanics = card.normalize(program.mechanics) as never;

    /*
     * A card that never collects anything cannot be stamped. Scanning a discount card is how staff
     * check it is real, so this is an ordinary outcome and not an error.
     */
    if (!card.accrues) {
      return {
        applied: false,
        reason: "no_accrual" as StampReason,
        enrollment,
        program,
        currentStamps: enrollment.currentProgress,
      };
    }

    /*
     * Whether this card will take more — which is NOT the same as whether it can be redeemed. A
     * full stamp card stops until the reward is taken; a points balance keeps climbing past the
     * threshold. Asking `redeemable` here would silently cap every points card at its first reward.
     */
    if (!card.acceptsMore(enrollment.currentProgress, program.stampsRequired, mechanics)) {
      return {
        applied: false,
        reason: "reward_ready" as StampReason,
        enrollment,
        program,
        currentStamps: enrollment.currentProgress,
      };
    }

    // cooldown: ignore a rapid re-scan of the same card
    const [last] = await db
      .select({ at: loyaltyProgressEvents.createdAt })
      .from(loyaltyProgressEvents)
      .where(and(eq(loyaltyProgressEvents.enrollmentId, input.enrollmentId), eq(loyaltyProgressEvents.source, "staff_scan")))
      .orderBy(desc(loyaltyProgressEvents.createdAt))
      .limit(1);
    if (last && Date.now() - last.at.getTime() < cooldownMs()) {
      return { applied: false, reason: "cooldown" as StampReason, enrollment, program, currentStamps: enrollment.currentProgress };
    }

    const inserted = await db
      .insert(loyaltyProgressEvents)
      .values({
        merchantId: input.merchantId,
        enrollmentId: input.enrollmentId,
        idempotencyKey: input.idempotencyKey,
        locationId: input.locationId,
        staffId: input.staffId,
        // What one scan is worth. A stamp card says 1; a points card will say whatever its earn
        // rate works out to. The ledger has always held a signed delta, so nothing else changes.
        delta: card.earn(mechanics, {}),
        source: "staff_scan",
      })
      .onConflictDoNothing({ target: [loyaltyProgressEvents.merchantId, loyaltyProgressEvents.idempotencyKey] })
      .returning();

    const [after] = await db
      .select({ currentStamps: enrollments.currentProgress })
      .from(enrollments)
      .where(eq(enrollments.id, input.enrollmentId));

    return {
      applied: inserted.length > 0,
      reason: (inserted.length > 0 ? "applied" : "duplicate") as StampReason,
      enrollment,
      program,
      currentStamps: after?.currentStamps ?? enrollment.currentProgress,
    };
  });

  const rewardReady = outcome.currentStamps >= outcome.program.stampsRequired;

  // Hand wallet propagation to the background worker so the request never waits on Apple/Google.
  // Best-effort: the stamp is already committed to the ledger (the truth). If the queue's Redis
  // is unreachable, we log and return anyway rather than fail a scan the customer already earned.
  if (outcome.applied && (outcome.enrollment.applePassId || outcome.enrollment.googleObjectId)) {
    try {
      await enqueueWalletSync({
        merchantId: input.merchantId,
        enrollmentId: input.enrollmentId,
        kind: "stamp",
      });
    } catch (err) {
      console.error("[wallet] enqueue failed (stamp committed; pass will sync late):", err);
    }
  }

  return {
    applied: outcome.applied,
    reason: outcome.reason,
    currentStamps: outcome.currentStamps,
    stampsRequired: outcome.program.stampsRequired,
    rewardReady,
  };
}
