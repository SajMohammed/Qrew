import { describe, it, expect } from "vitest";
import { qrState, shouldAdoptToken } from "./connection";

const TTL = 120_000;
const s = (seconds: number) => seconds * 1000;

describe("the card's QR", () => {
  it("is swapped for a fresh one 20 s before it lapses", () => {
    expect(shouldAdoptToken(0, TTL, s(99))).toBe(false);
    expect(shouldAdoptToken(0, TTL, s(101))).toBe(true);
  });

  it("is live while fresh and the card is reachable", () => {
    expect(qrState({ heldAt: 0, ttlMs: TTL, failing: null, now: s(30) })).toBe("live");
  });

  it("is reconnecting while fresh but the card can't be reached", () => {
    expect(qrState({ heldAt: 0, ttlMs: TTL, failing: "offline", now: s(30) })).toBe("reconnecting");
    expect(qrState({ heldAt: 0, ttlMs: TTL, failing: "server", now: s(30) })).toBe("reconnecting");
  });

  it("expires 5 s early — it was minted before the answer carrying it arrived", () => {
    expect(qrState({ heldAt: 0, ttlMs: TTL, failing: null, now: s(114.9) })).toBe("live");
    expect(qrState({ heldAt: 0, ttlMs: TTL, failing: null, now: s(115.1) })).toBe("expired");
  });

  it("follows whatever lifetime the server says", () => {
    expect(qrState({ heldAt: 0, ttlMs: s(60), failing: null, now: s(56) })).toBe("expired");
  });
});
