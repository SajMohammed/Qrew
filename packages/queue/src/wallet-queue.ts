import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { createQueueConnection } from "./connection";

/** The queue name. The producer (API) and consumer (wallet-worker) MUST use the exact same
 *  string on the same Redis, or jobs are pushed to a list nobody is reading. */
export const WALLET_QUEUE = "wallet-sync";

/**
 * Wallet jobs. Deliberately THIN — just keys, never a snapshot of a count or a design. The worker
 * re-reads the database when it runs, so the wallet always converges to the current state even if a
 * job is delayed, retried, deduplicated or runs out of order.
 */

/**
 * One card's pass after something happened to that card: "enroll" asks for it to be created;
 * "stamp" and "redeem" bring it up to date (creating it first if it somehow doesn't exist).
 * `notify` marks the one scan that made a reward ready — the only moment worth a lock-screen push.
 */
export interface PassJob {
  kind: "enroll" | "stamp" | "redeem";
  merchantId: string;
  enrollmentId: string;
  notify?: "reward_ready";
}

/** One card's pass after its programme's design changed what every pass shows. Low priority. */
export interface RefreshJob {
  kind: "refresh";
  merchantId: string;
  enrollmentId: string;
}

/** A programme's template (the shop's design and name), pushed after the owner changed either. */
export interface TemplateJob {
  kind: "template";
  merchantId: string;
  programId: string;
}

export type WalletJobData = PassJob | RefreshJob | TemplateJob;

/**
 * The longest a request will wait to hand a job to Redis. A healthy add takes about a
 * millisecond; the bound matters only when Redis is down, where BullMQ's add waits for the
 * connection to become ready — which, with ioredis retrying forever, never happens. Without it a
 * Redis outage hung every stamp and redeem even though the ledger write had already committed.
 */
export const ENQUEUE_TIMEOUT_MS = 500;

let queue: Queue<WalletJobData> | undefined;
let connection: Redis | undefined;

/** Lazily-created singleton producer handle (one Queue + one Redis connection per process). */
export function getWalletQueue(): Queue<WalletJobData> {
  if (!queue) {
    connection = createQueueConnection();
    queue = new Queue<WalletJobData>(WALLET_QUEUE, {
      connection,
      defaultJobOptions: {
        // Retry a handful of times with exponential backoff — this is what makes a transient
        // APNs/Google outage self-heal instead of dropping the pass update.
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        // Housekeeping so Redis doesn't grow without bound: keep recent history, discard the rest.
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    // Without a listener BullMQ prints a full stack trace on every reconnect attempt while Redis
    // is down — every couple of seconds — burying everything else in the log.
    queue.on("error", (err) => console.error("[wallet] queue Redis error:", err.message));
  }
  return queue;
}

/** Resolve or reject with `work`, but give up after ENQUEUE_TIMEOUT_MS. */
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`wallet queue did not accept the job within ${ENQUEUE_TIMEOUT_MS}ms (is Redis reachable?)`)),
      ENQUEUE_TIMEOUT_MS,
    );
  });
  try {
    // Promise.race subscribes to the work too, so its rejection after a timeout is still handled.
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enqueue a card's pass sync. Best-effort by contract: the ledger write is already committed,
 * so callers catch failures here rather than fail the user-facing request — and this never makes
 * them wait longer than ENQUEUE_TIMEOUT_MS to find out.
 *
 * An add that times out may still land once Redis comes back. That is harmless: the job is thin
 * and the worker re-reads the database, so a late job only brings the pass up to date.
 *
 * Never deduplicated: a stamp job may carry the reward-ready notification, and folding it into
 * another job would drop it.
 */
export async function enqueueWalletSync(data: PassJob): Promise<void> {
  await bounded(getWalletQueue().add("sync", data));
}

/**
 * Enqueue a programme's template push. Saving the design several times in a row collapses into at
 * most one running push and one waiting — the waiting one re-reads the latest design anyway.
 */
export async function enqueueTemplateSync(merchantId: string, programId: string): Promise<void> {
  const job: TemplateJob = { kind: "template", merchantId, programId };
  await bounded(
    getWalletQueue().add("template", job, { deduplication: { id: `template:${programId}`, keepLastIfActive: true } }),
  );
}

/**
 * Queue a refresh for every pass of a programme. Called by the worker, never on a request path.
 *
 * Priority 10 lets live stamp syncs (unprioritised) go first under the worker's rate limit, so a
 * backfill across thousands of passes never delays the pass of someone standing at the counter.
 * Deduplicated per card, so repeated design saves don't stack refreshes.
 */
export async function enqueuePassRefreshes(jobs: RefreshJob[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += 500) {
    await getWalletQueue().addBulk(
      jobs.slice(i, i + 500).map((data) => ({
        name: "refresh",
        data,
        opts: { priority: 10, deduplication: { id: `refresh:${data.enrollmentId}`, keepLastIfActive: true } },
      })),
    );
  }
}

export async function closeWalletQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
  // BullMQ treats a connection it was handed as shared and never closes it, so it has to be
  // released here — otherwise a process whose Redis is down keeps reconnecting after shutdown.
  if (connection) {
    connection.disconnect();
    connection = undefined;
  }
}
