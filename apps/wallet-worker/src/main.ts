import "./load-env"; // must be first: populates env before @qrew/db loads
import { Worker } from "bullmq";
import { WALLET_QUEUE, createWorkerConnection, type WalletJobData } from "@qrew/queue";
import { assertDeployableConfig, recordFinalFailure } from "@qrew/core";
import { assertAppRoleIsolated, closeDb } from "@qrew/db";
import { processWalletSync } from "./processor";

// Fail closed outside development: a deployed worker with the fake provider or no public URL would
// "succeed" at every job while no pass ever changed.
try {
  assertDeployableConfig("worker");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const connection = createWorkerConnection();

/**
 * The Worker long-polls the `wallet-sync` list in Redis and runs `processWalletSync` for each job.
 *
 * - concurrency: how many jobs run at once in THIS process. Scale out further by starting more
 *   worker processes — BullMQ hands each job to exactly one of them.
 * - limiter: a gentle global rate cap on writes to the wallet vendor, so a design change that
 *   refreshes thousands of passes trickles out instead of bursting. (Lock-screen notifications are
 *   milestone-only — see syncPass — so they are nowhere near Google's per-pass cap.)
 */
const worker = new Worker<WalletJobData>(
  WALLET_QUEUE,
  (job) => processWalletSync(job.data),
  {
    connection,
    // Started below, once the database role is known to be the row-level-security one.
    autorun: false,
    concurrency: Number(process.env.WALLET_WORKER_CONCURRENCY ?? 5),
    limiter: { max: 5, duration: 1000 },
  },
);

assertAppRoleIsolated().then(
  () => void worker.run(),
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);

worker.on("ready", () => console.log(`wallet-worker listening on "${WALLET_QUEUE}"`));
worker.on("completed", (job, result) => console.log(`✓ [job ${job.id}] ${result}`));
worker.on("failed", (job, err) => {
  console.error(`✗ [job ${job?.id}] ${err?.message}`);
  // Out of retries: record it where the owner can see it (see recordFinalFailure).
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void recordFinalFailure(job.data, err.message).catch((e: Error) =>
      console.error("could not record the wallet failure:", e.message),
    );
  }
});
// A connection-level error (e.g. Redis down) shouldn't crash the process — BullMQ reconnects.
worker.on("error", (err) => console.error("wallet-worker error:", err.message));

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} — draining wallet-worker…`);
  await worker.close(); // stop accepting jobs, let in-flight ones finish
  await connection.quit();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
