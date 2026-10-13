import { describe, it, expect } from "vitest";
import { WindowCounter, clientKey } from "../src/rate-window";

describe("WindowCounter", () => {
  it("allows up to the limit in a window, then refuses with the time left", () => {
    const c = new WindowCounter(3, 60_000);
    expect([1, 2, 3].map(() => c.hit("a", 1_000).allowed)).toEqual([true, true, true]);
    const over = c.hit("a", 11_000);
    expect(over.allowed).toBe(false);
    expect(over.retryAfterMs).toBe(50_000); // the window started at 1s and lasts 60s
  });

  it("starts afresh once the window has passed", () => {
    const c = new WindowCounter(1, 60_000);
    c.hit("a", 0);
    expect(c.hit("a", 30_000).allowed).toBe(false);
    expect(c.hit("a", 60_000).allowed).toBe(true);
  });

  it("counts each key separately", () => {
    const c = new WindowCounter(1, 60_000);
    expect(c.hit("a", 0).allowed).toBe(true);
    expect(c.hit("b", 0).allowed).toBe(true);
  });

  it("reports a block without counting one", () => {
    const c = new WindowCounter(2, 60_000);
    expect(c.blockedFor("a", 0)).toBe(0);
    c.hit("a", 0);
    expect(c.blockedFor("a", 0)).toBe(0); // one hit of two
    c.hit("a", 0);
    expect(c.blockedFor("a", 10_000)).toBe(50_000);
    expect(c.blockedFor("a", 10_000)).toBe(50_000); // asking twice changes nothing
  });

  it("stays bounded under a flood of distinct keys", () => {
    const c = new WindowCounter(5, 60_000, 100);
    for (let i = 0; i < 1_000; i++) c.hit(`client-${i}`, 0);
    // The newest keys still have their windows; the flood did not grow the map past its cap.
    expect(c.hit("client-999", 0).allowed).toBe(true);
    expect((c as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(100);
  });
});

describe("clientKey", () => {
  it("uses an IPv4 address as is, including one wrapped in IPv6", () => {
    expect(clientKey("203.0.113.9")).toBe("203.0.113.9");
    expect(clientKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  it("groups IPv6 by /64, so one subscriber can't rotate through fresh allowances", () => {
    const a = clientKey("2001:db8:abcd:12::1");
    const b = clientKey("2001:db8:abcd:12:ffff:ffff:ffff:ffff");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(clientKey("2001:db8:abcd:13::1")).not.toBe(a);
    expect(clientKey("::1")).toBe("0:0:0:0::/64");
  });

  it("buckets a request with no address together rather than exempting it", () => {
    expect(clientKey(undefined)).toBe("unknown");
  });
});
