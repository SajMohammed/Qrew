import { syncPass, syncProgramTemplate } from "@qrew/core";
import type { WalletJobData } from "@qrew/queue";

/**
 * Handle one wallet job.
 *
 * Jobs carry only ids, so every handler RE-READS the database: the DB is the truth, the wallet is a
 * cache catching up. That is what makes late, retried, deduplicated or out-of-order jobs safe — each
 * run pushes the CURRENT state, never a stale snapshot. The logic itself lives in @qrew/core, beside
 * the domain it reads and under its tests; this only routes.
 *
 * The return string is stored by BullMQ as the job's `returnvalue` and logged by main.ts, so a
 * completed job leaves a human-readable trail of exactly what it did.
 */
export function processWalletSync(data: WalletJobData): Promise<string> {
  return data.kind === "template" ? syncProgramTemplate(data) : syncPass(data);
}
