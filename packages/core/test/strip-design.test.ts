import { describe, it, expect, vi, afterEach } from "vitest";
import { encodePng, GOOGLE_STRIP, APPLE_STRIP } from "@qrew/wallet-core";
import { stripFor } from "../src/card";
import { normalizeDesign } from "../src/program";

/** Read the dimensions straight out of the PNG header. */
function size(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function png(w: number, h: number): Buffer {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 220;
    rgba[i * 4 + 1] = 110;
    rgba[i * 4 + 2] = 50;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(w, h, rgba);
}

function serve(body: Buffer) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  } as Response);
}

let n = 0;
/** A fresh URL per test — the artwork cache is module-level and deliberately never cleared. */
const url = () => `https://shop.test/art-${n++}.png`;

describe("rendering a design", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws each wallet at its own aspect ratio", async () => {
    const design = normalizeDesign({ brandColor: "#146A2E" });
    expect(size((await stripFor(design, 10, 4, "google"))!)).toEqual({ ...GOOGLE_STRIP });
    expect(size((await stripFor(design, 10, 4, "apple"))!)).toEqual({ ...APPLE_STRIP });
  });

  it("defaults to Google, the wallet we issue on", async () => {
    const design = normalizeDesign({ brandColor: "#146A2E" });
    expect((await stripFor(design, 10, 4))!.equals((await stripFor(design, 10, 4, "google"))!)).toBe(true);
  });

  it("honours the shop's layout and spacing choices", async () => {
    const base = { brandColor: "#146A2E" };
    const plain = (await stripFor(normalizeDesign(base), 10, 4))!;
    for (const change of [
      { stampLayout: "diamond" },
      { stampScale: 1.3 },
      { stampGapX: 0.5 },
      { stampGapY: 0.5 },
      { unearnedOpacity: 0.8 },
    ]) {
      const altered = (await stripFor(normalizeDesign({ ...base, ...change }), 10, 4))!;
      expect(altered.equals(plain), `${JSON.stringify(change)} changed nothing`).toBe(false);
    }
  });

  it("drops values outside their range instead of rendering something broken", async () => {
    const wild = normalizeDesign({ brandColor: "#146A2E", stampScale: 99, stampGapX: -3, stampLayout: "spiral" });
    expect(wild.stampScale).toBeUndefined();
    expect(wild.stampGapX).toBeUndefined();
    expect(wild.stampLayout).toBeUndefined();
    expect(size((await stripFor(wild, 10, 4))!)).toEqual({ ...GOOGLE_STRIP });
  });

  /*
   * The escape hatch: a shop with a designer supplies a finished strip and we do not touch it. The
   * trade is the live stamp count, so the same bytes come back whatever the customer has earned.
   */
  it("passes a custom strip through byte for byte", async () => {
    const artwork = png(60, 20);
    serve(artwork);
    const design = normalizeDesign({ brandColor: "#146A2E", customStripUrl: url() });

    const rendered = (await stripFor(design, 10, 4))!;

    expect(rendered.equals(artwork)).toBe(true);
    expect(size(rendered)).toEqual({ width: 60, height: 20 }); // ours, untouched — not our geometry
  });

  it("ignores the stamp count once a custom strip is in play", async () => {
    serve(png(60, 20));
    const design = normalizeDesign({ brandColor: "#146A2E", customStripUrl: url() });
    const [two, nine] = [await stripFor(design, 10, 2), await stripFor(design, 10, 9)];
    expect(two!.equals(nine!)).toBe(true);
  });

  it("falls back to a generated strip when the custom one cannot be fetched", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("host down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const design = normalizeDesign({ brandColor: "#146A2E", customStripUrl: url() });

    // A blank pass would be the worst outcome, so an unreachable strip degrades to a drawn one.
    expect(size((await stripFor(design, 10, 4))!)).toEqual({ ...GOOGLE_STRIP });
  });
});
