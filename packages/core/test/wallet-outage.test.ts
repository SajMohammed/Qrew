import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { adminDb, closeDb, merchants, loyaltyPrograms } from "@qrew/db";
import { closeWalletQueue } from "@qrew/queue";
import { enroll, addStamp, redeem } from "../src/index";

/*
 * Redis is down. Each test file runs in its own process, so pointing the queue at a closed port
 * here (before its first use) affects nothing else. Port 1 refuses connections immediately, which
 * is the case that used to hang: ioredis retries forever and BullMQ's add waits for a "ready" that
 * never comes. The ledger writes must commit and return regardless — the pass can sync late.
 */
process.env.REDIS_URL = "redis://127.0.0.1:1";

// And the wallet vendor is unusable: Google selected with no credentials, so constructing the
// provider throws. None of these paths may touch it — that is the worker's job.
process.env.WALLET_PROVIDER = "google";
delete process.env.GOOGLE_WALLET_ISSUER_ID;
delete process.env.GOOGLE_WALLET_SA_EMAIL;
delete process.env.GOOGLE_WALLET_SA_PRIVATE_KEY;

/** Well above ENQUEUE_TIMEOUT_MS (500ms) plus the DB round trips, well below "hung". */
const PROMPT_MS = 2_000;

let merchantId: string;
let programId: string;

beforeAll(async () => {
  const s = process.pid.toString(36);
  const [m] = await adminDb.insert(merchants).values({ name: "Outage Co", slug: `out-${s}` }).returning();
  merchantId = m!.id;
  const [p] = await adminDb
    .insert(loyaltyPrograms)
    .values({ merchantId, name: "Card", stampsRequired: 1, bonusStamps: 0 })
    .returning();
  programId = p!.id;
});

afterAll(async () => {
  await closeWalletQueue(); // releases the reconnecting client, or the process lingers
  await adminDb.delete(merchants).where(eq(merchants.id, merchantId)); // cascades
  await closeDb();
});

async function timed<T>(work: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const started = performance.now();
  const result = await work();
  return { result, ms: performance.now() - started };
}

describe("with the wallet queue's Redis unreachable and no usable wallet vendor", () => {
  it("still enrols, stamps and redeems — promptly", async () => {
    process.env.STAMP_COOLDOWN_SECONDS = "0";

    const enrolled = await timed(() => enroll({ merchantId, programId }));
    expect(enrolled.result.alreadyEnrolled).toBe(false);
    expect(enrolled.ms).toBeLessThan(PROMPT_MS);
    const { enrollmentId } = enrolled.result;

    const stamped = await timed(() => addStamp({ merchantId, enrollmentId, idempotencyKey: "outage-s1" }));
    expect(stamped.result.applied).toBe(true);
    expect(stamped.result.rewardReady).toBe(true);
    expect(stamped.ms).toBeLessThan(PROMPT_MS);

    const redeemed = await timed(() => redeem({ merchantId, enrollmentId, idempotencyKey: "outage-r1" }));
    expect(redeemed.result.redeemed).toBe(true);
    expect(redeemed.result.currentStamps).toBe(0);
    expect(redeemed.ms).toBeLessThan(PROMPT_MS);
  });
});
