import { eq } from "drizzle-orm";
import { withTenant, loyaltyPrograms, enrollments } from "@qrew/db";
import { getWalletProvider, stripUrlFor } from "@qrew/wallet-core";
import type { WalletJobData } from "@qrew/queue";

/**
 * Handle one wallet-sync job.
 *
 * The job payload is just an id + kind, so we RE-READ the enrollment here: the DB is the truth,
 * the wallet is a cache catching up. This is what makes late/retried/out-of-order jobs safe —
 * every run pushes the enrollment's *current* stamp count, not a stale snapshot.
 *
 * The return string is stored by BullMQ as the job's `returnvalue` and logged by main.ts, so a
 * completed job leaves a human-readable trail of exactly what it synced.
 */
export async function processWalletSync(data: WalletJobData): Promise<string> {
  const provider = getWalletProvider();

  const ctx = await withTenant(data.merchantId, async (db) => {
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, data.enrollmentId));
    if (!enrollment) return null;
    const [program] = await db
      .select({ stampsRequired: loyaltyPrograms.stampsRequired })
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, enrollment.programId));
    return { enrollment, stampsRequired: program?.stampsRequired ?? 0 };
  });

  if (!ctx) return `enrollment ${data.enrollmentId} gone — skipped`;

  const { enrollment, stampsRequired } = ctx;
  if (!enrollment.applePassId && !enrollment.googleObjectId) {
    return `${enrollment.cardSerial} has no wallet pass — skipped`;
  }

  const ref = {
    serial: enrollment.cardSerial,
    applePassId: enrollment.applePassId ?? undefined,
    googleObjectId: enrollment.googleObjectId ?? undefined,
  };

  // 1) reflect the current count on the pass, then 2) nudge the lock screen. With a real
  // provider these are the slow external calls we moved off the request path.
  await provider.updateStamps(ref, {
    serial: enrollment.cardSerial,
    stampsRequired,
    currentStamps: enrollment.currentStamps,
    // The strip URL embeds the count, so this is what actually redraws the stamps on the pass.
    stripUrl: stripUrlFor(enrollment.cardSerial, enrollment.currentStamps),
  });
  const message = walletMessage(data.kind, enrollment.currentStamps, stampsRequired);
  await provider.pushUpdate(ref, message);

  return `synced ${enrollment.cardSerial} → ${enrollment.currentStamps}/${stampsRequired} (${message})`;
}

/** The lock-screen nudge. Moved here from the domain layer — it's a wallet-presentation concern. */
function walletMessage(kind: WalletJobData["kind"], currentStamps: number, stampsRequired: number): string {
  if (kind === "redeem") return "Reward redeemed — see you next time!";
  const remaining = stampsRequired - currentStamps;
  if (remaining <= 0) return "Reward ready 🎉";
  if (remaining === 1) return "1 stamp to go";
  return `${remaining} stamps to go`;
}
