import { eq } from "drizzle-orm";
import { withTenant, loyaltyPrograms, enrollments } from "@qrew/db";
import { getWalletProvider, stripUrlFor } from "@qrew/wallet-core";
import { cardTypeModule, isCardType, walletPassFor } from "@qrew/core";
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
      .select({
        stampsRequired: loyaltyPrograms.stampsRequired,
        rewardText: loyaltyPrograms.rewardText,
        type: loyaltyPrograms.type,
        mechanics: loyaltyPrograms.mechanics,
      })
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, enrollment.programId));
    return {
      enrollment,
      stampsRequired: program?.stampsRequired ?? 0,
      rewardText: program?.rewardText,
      card: cardTypeModule(isCardType(program?.type) ? program!.type : "stamp"),
      mechanics: program?.mechanics,
    };
  });

  if (!ctx) return `enrollment ${data.enrollmentId} gone — skipped`;

  const { enrollment, stampsRequired, rewardText, card, mechanics } = ctx;
  // A product with no Google loyalty mapping has no pass yet (see getCard). Creating one here would
  // issue a stamp counter for a card that has nothing to count.
  if (card.wallet.google !== "loyalty") return `${enrollment.cardSerial}: ${card.type} cards have no pass yet — skipped`;

  // The stored ids are only hints: the provider falls back to the id derived from the serial.
  const ref = {
    serial: enrollment.cardSerial,
    applePassId: enrollment.applePassId ?? undefined,
    googleObjectId: enrollment.googleObjectId ?? undefined,
  };

  // 1) reflect the current count on the pass, then 2) nudge the lock screen. With a real
  // provider these are the slow external calls we moved off the request path.
  const present = await provider.updateStamps(ref, {
    serial: enrollment.cardSerial,
    stampsRequired,
    rewardText,
    currentStamps: enrollment.currentProgress,
    // The strip URL embeds the count, so this is what actually redraws the stamps on the pass —
    // for the one product that is drawn as stamps. The rest carry a balance and no image.
    stripUrl: card.drawsStampStrip
      ? stripUrlFor(enrollment.cardSerial, enrollment.currentProgress)
      : undefined,
    pointsLabel: card.unitLabel(card.normalize(mechanics) as never),
  });

  // No pass yet — a new card, or one whose "enroll" job was lost. Create it from the card's current
  // state, which already includes this change, so nothing is dropped. A pass nobody has saved yet
  // has nobody to notify, so there is no message to send.
  if (!present) {
    const content = await walletPassFor(enrollment.cardSerial);
    if (!content) return `${enrollment.cardSerial} gone before its pass was created — skipped`;
    await provider.issuePass(content);
    return `created pass for ${enrollment.cardSerial} at ${enrollment.currentProgress}/${stampsRequired}`;
  }
  if (data.kind === "enroll") return `pass for ${enrollment.cardSerial} already exists`;

  const message = walletMessage(data.kind, enrollment.currentProgress, stampsRequired);
  await provider.pushUpdate(ref, message);

  return `synced ${enrollment.cardSerial} → ${enrollment.currentProgress}/${stampsRequired} (${message})`;
}

/** The lock-screen nudge. Moved here from the domain layer — it's a wallet-presentation concern. */
function walletMessage(kind: WalletJobData["kind"], currentStamps: number, stampsRequired: number): string {
  if (kind === "redeem") return "Reward redeemed — see you next time!";
  const remaining = stampsRequired - currentStamps;
  if (remaining <= 0) return "Reward ready 🎉";
  if (remaining === 1) return "1 stamp to go";
  return `${remaining} stamps to go`;
}
