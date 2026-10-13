/**
 * The Redis database core's tests queue wallet jobs on — one no worker drains (see vitest.setup.ts).
 * Local Docker and CI both run Redis on localhost.
 */
export const TEST_REDIS_URL = "redis://localhost:6379/15";

/**
 * Before the run: empty the test queue. Nothing ever consumes these jobs, so without this every run
 * would add to them for good. Bounded, so a missing Redis can't hang the suite before it starts — the
 * tests that need Redis will say so themselves.
 */
export async function setup(): Promise<void> {
  process.env.REDIS_URL = TEST_REDIS_URL;
  const { getWalletQueue, closeWalletQueue } = await import("@qrew/queue");
  const cleared = getWalletQueue().obliterate({ force: true });
  await Promise.race([cleared, new Promise((resolve) => setTimeout(resolve, 3_000))]).catch(() => {});
  await closeWalletQueue();
}
