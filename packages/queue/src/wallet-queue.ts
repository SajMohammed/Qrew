import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { createQueueConnection } from "./connection";

/** The queue name. The producer (API) and consumer (wallet-worker) MUST use the exact same
 *  string on the same Redis, or jobs are pushed to a list nobody is reading. */
export const WALLET_QUEUE = "wallet-sync";

/**
 * A wallet-sync job. Deliberately THIN — just the keys, not a snapshot of the stamp count.
 * The worker re-reads the enrollment when it runs, so the wallet always converges to the
 * DB's current value even if the job is delayed, retried, or runs out of order.
 *
 * "enroll" asks the worker to create the card's pass; "stamp" and "redeem" bring it up to date
 * (creating it first if it somehow doesn't exist yet).
 */
export interface WalletJobData {
  merchantId: string;
  enrollmentId: string;
  kind: "enroll" | "stamp" | "redeem";
}

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

/**
 * Enqueue a wallet-sync job. Best-effort by contract: the ledger write is already committed,
 * so callers catch failures here rather than fail the user-facing request — and this never makes
 * them wait longer than ENQUEUE_TIMEOUT_MS to find out.
 *
 * An add that times out may still land once Redis comes back. That is harmless: the job is thin
 * and the worker re-reads the database, so a late job only brings the pass up to date.
 */
export async function enqueueWalletSync(data: WalletJobData): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`wallet queue did not accept the job within ${ENQUEUE_TIMEOUT_MS}ms (is Redis reachable?)`)),
      ENQUEUE_TIMEOUT_MS,
    );
  });
  try {
    // Promise.race subscribes to the add too, so its rejection after a timeout is still handled.
    await Promise.race([getWalletQueue().add("sync", data), timedOut]);
  } finally {
    clearTimeout(timer);
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
