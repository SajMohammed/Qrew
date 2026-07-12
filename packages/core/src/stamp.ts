import { and, desc, eq } from "drizzle-orm";
import { withTenant, loyaltyPrograms, enrollments, stampEvents } from "@qrew/db";
import { getWalletProvider } from "@qrew/wallet-core";

export interface AddStampInput {
  merchantId: string;
  enrollmentId: string;
  idempotencyKey: string;
  locationId?: string;
  staffId?: string;
}

export type StampReason = "applied" | "duplicate" | "cooldown";

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
 *   1. cooldown guard — a re-scan of the same card within the window is ignored
 *      (belt-and-suspenders alongside the idempotency key).
 *   2. append to the ledger (idempotent); the DB trigger updates current_stamps.
 *   3. sync the wallet pass OUTSIDE the transaction.
 * TODO(2.5): move the wallet sync onto a BullMQ job so the request never waits on it.
 */
export async function addStamp(input: AddStampInput): Promise<StampResult> {
  const provider = getWalletProvider();

  const outcome = await withTenant(input.merchantId, async (db) => {
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, input.enrollmentId));
    if (!enrollment) throw new Error("enrollment not found");
    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, enrollment.programId));
    if (!program) throw new Error("program not found");

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

  // sync the wallet pass outside the transaction (TODO(2.5): enqueue a BullMQ job)
  if (outcome.applied && (outcome.enrollment.applePassId || outcome.enrollment.googleObjectId)) {
    const ref = {
      serial: outcome.enrollment.cardSerial,
      applePassId: outcome.enrollment.applePassId ?? undefined,
      googleObjectId: outcome.enrollment.googleObjectId ?? undefined,
    };
    await provider.updateStamps(ref, outcome.currentStamps);
    const remaining = outcome.program.stampsRequired - outcome.currentStamps;
    const message = rewardReady
      ? "Reward ready 🎉"
      : remaining === 1
        ? "1 stamp to go"
        : `${remaining} stamps to go`;
    await provider.pushUpdate(ref, message);
  }

  return {
    applied: outcome.applied,
    reason: outcome.reason,
    currentStamps: outcome.currentStamps,
    stampsRequired: outcome.program.stampsRequired,
    rewardReady,
  };
}
