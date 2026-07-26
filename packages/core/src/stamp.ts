import { and, desc, eq } from "drizzle-orm";
import { withTenant, loyaltyPrograms, enrollments, stampEvents } from "@qrew/db";
import { enqueueWalletSync } from "@qrew/queue";

export interface AddStampInput {
  merchantId: string;
  enrollmentId: string;
  idempotencyKey: string;
  locationId?: string;
  staffId?: string;
}

export type StampReason = "applied" | "duplicate" | "cooldown" | "reward_ready";

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
 *   2. append to the ledger (idempotent); the DB trigger updates current_stamps.
 *   3. enqueue a wallet-sync job — the wallet-worker updates the pass off the request path,
 *      so the cashier never waits on Apple/Google.
 */
export async function addStamp(input: AddStampInput): Promise<StampResult> {
  const outcome = await withTenant(input.merchantId, async (db) => {
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId));
    if (!enrollment) throw new Error("enrollment not found");
    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, enrollment.programId));
    if (!program) throw new Error("program not found");

    // Don't stamp past the reward threshold — the card is full; the customer must redeem first.
    if (enrollment.currentStamps >= program.stampsRequired) {
      return {
        applied: false,
        reason: "reward_ready" as StampReason,
        enrollment,
        program,
        currentStamps: enrollment.currentStamps,
      };
    }

    // cooldown: ignore a rapid re-scan of the same card
    const [last] = await db
      .select({ at: stampEvents.createdAt })
      .from(stampEvents)
      .where(and(eq(stampEvents.enrollmentId, input.enrollmentId), eq(stampEvents.source, "staff_scan")))
      .orderBy(desc(stampEvents.createdAt))
      .limit(1);
    if (last && Date.now() - last.at.getTime() < cooldownMs()) {
      return { applied: false, reason: "cooldown" as StampReason, enrollment, program, currentStamps: enrollment.currentStamps };
    }

    const inserted = await db
      .insert(stampEvents)
      .values({
        merchantId: input.merchantId,
        enrollmentId: input.enrollmentId,
        idempotencyKey: input.idempotencyKey,
        locationId: input.locationId,
        staffId: input.staffId,
        delta: 1,
        source: "staff_scan",
      })
      .onConflictDoNothing({ target: [stampEvents.merchantId, stampEvents.idempotencyKey] })
      .returning();

    const [after] = await db
      .select({ currentStamps: enrollments.currentStamps })
      .from(enrollments)
      .where(eq(enrollments.id, input.enrollmentId));

    return {
      applied: inserted.length > 0,
      reason: (inserted.length > 0 ? "applied" : "duplicate") as StampReason,
      enrollment,
      program,
      currentStamps: after?.currentStamps ?? enrollment.currentStamps,
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
