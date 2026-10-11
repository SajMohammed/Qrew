import { describe, it, expect } from "vitest";
import { PresentationTracker, PRESENTATION_GAP_MS, RETRY_EVERY_MS } from "./presentation";

function tracker() {
  let n = 0;
  return new PresentationTracker(() => `key-${++n}`);
}

describe("PresentationTracker", () => {
  it("sends a card held in view for 30 s exactly once", () => {
    const t = tracker();
    const sent = [];
    for (let now = 0; now <= 30_000; now += 100) {
      const p = t.frame("CARD", now, false);
      if (p) sent.push(p);
    }
    expect(sent).toEqual([{ value: "CARD", key: "key-1" }]);
  });

  it("keeps one presentation through a dropout shorter than the gap", () => {
    const t = tracker();
    expect(t.frame("CARD", 0, false)).not.toBeNull();
    expect(t.frame("CARD", PRESENTATION_GAP_MS, false)).toBeNull();
  });

  it("treats the same card shown again after the gap as a new presentation, with a new key", () => {
    const t = tracker();
    t.frame("CARD", 0, false);
    expect(t.frame("CARD", PRESENTATION_GAP_MS + 1, false)).toEqual({ value: "CARD", key: "key-2" });
  });

  it("retries a request that got no answer with the same key, no sooner than the retry delay", () => {
    const t = tracker();
    t.frame("CARD", 0, false);
    t.failed(500);
    expect(t.frame("CARD", 500 + RETRY_EVERY_MS - 100, false)).toBeNull();
    expect(t.frame("CARD", 500 + RETRY_EVERY_MS, false)).toEqual({ value: "CARD", key: "key-1" });
    expect(t.frame("CARD", 500 + RETRY_EVERY_MS + 100, false)).toBeNull(); // once per failure
  });

  it("does not retry once the card has left view", () => {
    const t = tracker();
    t.frame("CARD", 0, false);
    t.failed(100);
    // Seen again only after the gap: a new presentation (new key), not a retry of the old one.
    expect(t.frame("CARD", 100 + PRESENTATION_GAP_MS + 1, false)?.key).toBe("key-2");
  });

  it("keeps the current card alive while a slow request is in flight", () => {
    const t = tracker();
    t.frame("CARD", 0, false);
    for (let now = 100; now <= 8_000; now += 100) expect(t.frame("CARD", now, true)).toBeNull();
    // The answer came at 8 s; the card was in view all along, so it is still the same presentation.
    expect(t.frame("CARD", 8_100, false)).toBeNull();
  });

  it("ignores another card while busy, then gives it its own presentation", () => {
    const t = tracker();
    t.frame("CARD-A", 0, false);
    expect(t.frame("CARD-B", 100, true)).toBeNull();
    expect(t.frame("CARD-B", 200, false)).toEqual({ value: "CARD-B", key: "key-2" });
  });
});
