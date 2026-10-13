import { and, count, eq, inArray, sql } from "drizzle-orm";
import {
  withTenant,
  merchants,
  loyaltyPrograms,
  enrollments,
  customers,
  redemptions,
  type TenantDb,
} from "@qrew/db";
import { getWalletProvider, type PassSyncOutcome } from "@qrew/wallet-core";
import {
  enqueuePassRefreshes,
  enqueueTemplateSync,
  type PassJob,
  type RefreshJob,
  type TemplateJob,
  type WalletJobData,
} from "@qrew/queue";
import { cardTypeModule, isCardType } from "./card-types";
import {
  isWalletIssuable,
  passContentFor,
  passFingerprint,
  passUpdateFor,
  templateContentFor,
} from "./wallet-pass";

/*
 * Keeping wallet passes in step with the database — what the wallet worker runs. Lives in core,
 * beside the domain it reads, so it is tested against real Postgres like everything else.
 */

const short = (serial: string) => serial.slice(0, 8);

/** A card and everything its pass shows, read inside the tenant. */
async function readPassSource(merchantId: string, enrollmentId: string) {
  const [row] = await withTenant(merchantId, (db) =>
    db
      .select({
        serial: enrollments.cardSerial,
        shortCode: enrollments.shortCode,
        programId: enrollments.programId,
        applePassId: enrollments.applePassId,
        googleObjectId: enrollments.googleObjectId,
        customerName: customers.name,
        merchantName: merchants.name,
        programName: loyaltyPrograms.name,
        rewardText: loyaltyPrograms.rewardText,
        currentProgress: enrollments.currentProgress,
        stampsRequired: loyaltyPrograms.stampsRequired,
        type: loyaltyPrograms.type,
        mechanics: loyaltyPrograms.mechanics,
        cardDesign: loyaltyPrograms.cardDesign,
      })
      .from(enrollments)
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
      .innerJoin(merchants, eq(merchants.id, enrollments.merchantId))
      .innerJoin(customers, eq(customers.id, enrollments.customerId))
      .where(eq(enrollments.id, enrollmentId)),
  );
  return row;
}

/**
 * Bring one card's pass up to date — creating it if there is none yet.
 *
 * Creation covers a new card (an "enroll" job) and any card whose earlier job was lost: the pass is
 * built from the card's current state, which already includes whatever this job was about.
 *
 * A notification goes out only for the scan that made a reward ready, only if the card is still
 * redeemable when this runs, and only to someone who actually has the pass saved. It is never
 * retried: Google allows a few per pass per day, and a retry could spend them on a duplicate.
 */
export async function syncPass(data: PassJob | RefreshJob): Promise<string> {
  const first = await readPassSource(data.merchantId, data.enrollmentId);
  if (!first) return `enrollment ${data.enrollmentId} gone — skipped`;
  let src = first;
  if (!isWalletIssuable(src.type)) return `${short(src.serial)}: ${src.type} cards have no pass yet — skipped`;

  const provider = getWalletProvider();
  // The stored ids are only hints: the provider falls back to the id derived from the serial.
  const ref = {
    serial: src.serial,
    applePassId: src.applePassId ?? undefined,
    googleObjectId: src.googleObjectId ?? undefined,
  };

  /*
   * Jobs for one card can run side by side — a stamp's, and a design change's refresh — and each
   * writes what it read. One that read the older picture could land last and leave the pass behind
   * until the next scan. So after writing, look again, and write again if the card has moved on.
   */
  let outcome: PassSyncOutcome;
  for (let round = 0; ; round++) {
    const update = passUpdateFor(src);
    outcome = await provider.updateStamps(ref, update);
    if (outcome === "absent") {
      // A pass barcode carries the serial, never the rotating app token (see the Google provider).
      await provider.issuePass(passContentFor(src, src.serial));
      return `created pass for ${short(src.serial)} at ${src.currentProgress}/${src.stampsRequired}`;
    }
    const now = await readPassSource(data.merchantId, data.enrollmentId);
    if (!now || round === 2 || JSON.stringify(passUpdateFor(now)) === JSON.stringify(update)) break;
    src = now;
  }
  const progress = `${src.currentProgress}/${src.stampsRequired}`;

  let notified = "";
  if (data.kind === "stamp" && data.notify === "reward_ready" && outcome === "in_wallet") {
    const card = cardTypeModule(isCardType(src.type) ? src.type : "stamp");
    if (card.redeemable(src.currentProgress, src.stampsRequired, card.normalize(src.mechanics) as never)) {
      try {
        // Unique per reward cycle (Google refuses a repeated id), and derived from the domain
        // rather than a queue counter that restarts whenever Redis does.
        const [cycle] = await withTenant(data.merchantId, (db) =>
          db.select({ n: count() }).from(redemptions).where(eq(redemptions.enrollmentId, data.enrollmentId)),
        );
        await provider.pushUpdate(ref, {
          id: `reward-${data.enrollmentId}-${cycle?.n ?? 0}`,
          header: src.merchantName,
          body: `Your reward is ready: ${src.rewardText}. Show this card at the counter.`,
        });
        notified = ", notified";
      } catch (err) {
        console.error(`[wallet] reward notification for ${short(src.serial)} failed:`, err instanceof Error ? err.message : err);
        notified = ", notify failed";
      }
    }
  }
  return `synced ${short(src.serial)} → ${progress} (${outcome}${notified})`;
}

/**
 * Push a programme's template — the shop's name and design — and, when what every pass shows has
 * changed, queue a refresh of each of its passes. Throws if the push fails, so the job retries.
 *
 * Records the GENERATION it read alongside the design it pushed (see migration 0013): a save that
 * lands while this runs bumps the generation past it, so that save still shows as pending and its
 * own job follows.
 */
export async function syncProgramTemplate(data: TemplateJob): Promise<string> {
  const ctx = await withTenant(data.merchantId, async (db) => {
    const [program] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, data.programId));
    if (!program) return null;
    const [merchant] = await db.select({ name: merchants.name }).from(merchants);
    return { program, merchantName: merchant?.name ?? "" };
  });
  if (!ctx) return `programme ${data.programId} gone — skipped`;
  const { program, merchantName } = ctx;
  const generation = program.walletSyncGeneration;

  let refreshed = 0;
  let fingerprint: string | undefined;
  if (isWalletIssuable(program.type)) {
    await getWalletProvider().syncTemplate(templateContentFor(program, merchantName));
    fingerprint = passFingerprint(program);
    if (fingerprint !== program.walletPassesFingerprint) {
      const cards = await withTenant(data.merchantId, (db) =>
        db
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(and(eq(enrollments.programId, program.id), eq(enrollments.status, "active"))),
      );
      await enqueuePassRefreshes(
        cards.map((c): RefreshJob => ({ kind: "refresh", merchantId: data.merchantId, enrollmentId: c.id })),
      );
      refreshed = cards.length;
    }
  }

  await withTenant(data.merchantId, (db) =>
    db
      .update(loyaltyPrograms)
      .set({
        walletSyncedGeneration: sql`greatest(${loyaltyPrograms.walletSyncedGeneration}, ${generation})`,
        // Only an error this push answers for: a newer save may have failed to queue meanwhile.
        walletSyncError: sql`case when ${loyaltyPrograms.walletSyncGeneration} <= ${generation} then null else ${loyaltyPrograms.walletSyncError} end`,
        // A new fingerprint starts a new round of refreshes, so the failure count starts again too.
        ...(fingerprint && fingerprint !== program.walletPassesFingerprint
          ? { walletPassesFingerprint: fingerprint, walletSyncFailedPasses: 0 }
          : {}),
      })
      .where(eq(loyaltyPrograms.id, program.id)),
  );

  const what = isWalletIssuable(program.type) ? "pushed" : "has no pass — nothing to push";
  return `template ${program.id.slice(0, 8)} ${what} (generation ${generation}${refreshed ? `, refreshing ${refreshed} passes` : ""})`;
}

/**
 * Inside a save's transaction: mark these programmes as needing a template push. Bumping the
 * generation here, before the commit, is what makes the saved view read "pending" straight away.
 */
export async function markTemplateSyncRequested(db: TenantDb, programIds: string[]): Promise<void> {
  if (programIds.length === 0) return;
  await db
    .update(loyaltyPrograms)
    .set({
      walletSyncGeneration: sql`${loyaltyPrograms.walletSyncGeneration} + 1`,
      walletSyncRequestedAt: sql`now()`,
      walletSyncError: null,
    })
    .where(inArray(loyaltyPrograms.id, programIds));
}

/**
 * After the commit: queue the pushes marked above. Never throws — the save already happened — but
 * a push that couldn't even be queued is recorded, so the owner sees it failed instead of a
 * "pending" that never resolves. Returns whether everything was queued.
 */
export async function queueTemplateSyncs(merchantId: string, programIds: string[]): Promise<boolean> {
  let allQueued = true;
  for (const programId of programIds) {
    try {
      await enqueueTemplateSync(merchantId, programId);
    } catch (err) {
      allQueued = false;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[wallet] could not queue the template push for ${programId}:`, message);
      await withTenant(merchantId, (db) =>
        db
          .update(loyaltyPrograms)
          .set({ walletSyncError: `could not queue: ${message}`.slice(0, 500) })
          .where(eq(loyaltyPrograms.id, programId)),
      ).catch(() => {}); // the database may be the thing that's down; the log above still has it
    }
  }
  return allQueued;
}

/**
 * A job that used up its retries. A template push records its error for the owner; a pass refresh
 * counts towards the programme's "couldn't be updated" passes; a single card's sync needs nothing —
 * its next scan tries again.
 */
export async function recordFinalFailure(data: WalletJobData, message: string): Promise<void> {
  if (data.kind === "template") {
    await withTenant(data.merchantId, (db) =>
      db
        .update(loyaltyPrograms)
        .set({ walletSyncError: message.slice(0, 500) })
        .where(eq(loyaltyPrograms.id, data.programId)),
    );
  } else if (data.kind === "refresh") {
    await withTenant(data.merchantId, async (db) => {
      const [card] = await db
        .select({ programId: enrollments.programId })
        .from(enrollments)
        .where(eq(enrollments.id, data.enrollmentId));
      if (!card) return;
      await db
        .update(loyaltyPrograms)
        .set({ walletSyncFailedPasses: sql`${loyaltyPrograms.walletSyncFailedPasses} + 1` })
        .where(eq(loyaltyPrograms.id, card.programId));
    });
  }
}

export type WalletSyncState = "none" | "pending" | "ok" | "failed";
export interface WalletSyncView {
  state: WalletSyncState;
  /** Passes whose refresh finally failed — they catch up at that customer's next scan. */
  failedPasses: number;
}

/** A push nobody has picked up after this long is reported as failed — the worker or Redis is down. */
export const WALLET_SYNC_STALE_MS = 15 * 60_000;

/** Whether the programme's last design change has reached the passes in customers' phones. */
export function walletSyncView(
  p: Pick<
    typeof loyaltyPrograms.$inferSelect,
    "walletSyncGeneration" | "walletSyncedGeneration" | "walletSyncRequestedAt" | "walletSyncError" | "walletSyncFailedPasses"
  >,
  now: number = Date.now(),
): WalletSyncView {
  const failedPasses = p.walletSyncFailedPasses;
  if (p.walletSyncGeneration === 0) return { state: "none", failedPasses };
  if (p.walletSyncError) return { state: "failed", failedPasses };
  if (p.walletSyncedGeneration >= p.walletSyncGeneration) return { state: "ok", failedPasses };
  if (p.walletSyncRequestedAt && now - p.walletSyncRequestedAt.getTime() > WALLET_SYNC_STALE_MS) {
    return { state: "failed", failedPasses };
  }
  return { state: "pending", failedPasses };
}
