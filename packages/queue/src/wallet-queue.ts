import { Queue } from "bullmq";
import { createQueueConnection } from "./connection";

/** The queue name. The producer (API) and consumer (wallet-worker) MUST use the exact same
 *  string on the same Redis, or jobs are pushed to a list nobody is reading. */
export const WALLET_QUEUE = "wallet-sync";

/**
 * A wallet-sync job. Deliberately THIN — just the keys, not a snapshot of the stamp count.
 * The worker re-reads the enrollment when it runs, so the wallet always converges to the
 * DB's current value even if the job is delayed, retried, or runs out of order.
 */
export interface WalletJobData {
  merchantId: string;
  enrollmentId: string;
  kind: "stamp" | "redeem";
}

let queue: Queue<WalletJobData> | undefined;

/** Lazily-created singleton producer handle (one Queue + one Redis connection per process). */
export function getWalletQueue(): Queue<WalletJobData> {
  if (!queue) {
    queue = new Queue<WalletJobData>(WALLET_QUEUE, {
      connection: createQueueConnection(),
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
  }
  return queue;
}

/**
 * Enqueue a wallet-sync job. Best-effort by contract: the ledger write is already committed,
 * so callers should catch failures here rather than fail the user-facing request.
 */
export async function enqueueWalletSync(data: WalletJobData): Promise<void> {
  await getWalletQueue().add("sync", data);
}

export async function closeWalletQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
