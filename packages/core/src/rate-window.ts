import { isIP } from "node:net";

/**
 * A fixed-window counter: at most `limit` hits per key per `windowMs`.
 *
 * In memory, deliberately. The pilot runs one API task, and a limiter backed by Redis would turn a
 * Redis outage into failed requests — the thing the wallet queue was just made immune to. The known
 * costs are written down rather than hidden: counts reset when the process restarts, and scaling
 * out multiplies the effective limit by the number of tasks. Moving to a shared store later only
 * changes this class's internals.
 *
 * Bounded: at `maxKeys` it first sweeps expired windows, then drops the oldest — so a flood of
 * distinct clients costs memory once, not forever.
 */
export class WindowCounter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxKeys = 100_000,
  ) {}

  /** Count one hit. `retryAfterMs` is how long until this key's window resets. */
  hit(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    let w = this.windows.get(key);
    if (!w || now >= w.resetAt) {
      if (!w) this.makeRoom(now);
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    w.count++;
    return { allowed: w.count <= this.limit, retryAfterMs: w.resetAt - now };
  }

  /** How long this key stays blocked, without counting a hit. 0 when it isn't. */
  blockedFor(key: string, now = Date.now()): number {
    const w = this.windows.get(key);
    return w && now < w.resetAt && w.count >= this.limit ? w.resetAt - now : 0;
  }

  private makeRoom(now: number): void {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, w] of this.windows) if (now >= w.resetAt) this.windows.delete(key);
    if (this.windows.size >= this.maxKeys) this.windows.delete(this.windows.keys().next().value!);
  }
}

/**
 * The key a client is limited under.
 *
 * An IPv6 subscriber is handed a whole /64, so limiting each address separately would let one phone
 * walk through 2^64 fresh allowances. Addresses are grouped by /64 instead; IPv4 is used as is
 * (an IPv4-mapped address counts as IPv4).
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const address = ip.replace(/%.*$/, ""); // drop an interface zone
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (isIP(address) !== 6) return address;

  // Expand "::" so the first four groups can be read off.
  const [head, tail] = address.includes("::") ? address.split("::") : [address, undefined];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}
