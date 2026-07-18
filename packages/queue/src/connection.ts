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
 * `enableOfflineQueue: false` makes `queue.add()` reject IMMEDIATELY when Redis is unreachable,
 * instead of buffering the command forever. That matters: the whole point of the worker is that
 * a stamp never waits on the wallet — so it must never wait on the queue's Redis either. A failed
 * enqueue is caught by the caller and the (already-committed) stamp still returns instantly.
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
