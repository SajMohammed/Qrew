import { Redis, type RedisOptions } from "ioredis";

function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

// BullMQ workers issue *blocking* Redis reads (BRPOPLPUSH etc.). ioredis refuses to run a
// blocking command under its default retry policy, so BullMQ requires maxRetriesPerRequest:null
// on any connection a Worker or QueueEvents uses. See createWorkerConnection below.
const base: RedisOptions = { maxRetriesPerRequest: null };

/**
 * Producer connection (used by the Queue inside the API).
 *
 * `enableOfflineQueue: false` makes a command fail instead of buffering when the connection drops
 * AFTER it was established. It does not help when Redis was never reachable: BullMQ's add first
 * waits for the connection to become ready, and that wait is what enqueueWalletSync bounds with
 * its own timeout. Between the two, a stamp never waits on the queue's Redis for long.
 */
export function createQueueConnection(): Redis {
  return new Redis(redisUrl(), { ...base, enableOfflineQueue: false });
}

/**
 * Worker connection (used by the wallet-worker process). Keeps the offline buffer so a brief
 * Redis blip doesn't kill the worker — it reconnects and resumes draining the queue.
 */
export function createWorkerConnection(): Redis {
  return new Redis(redisUrl(), base);
}
