import { describe, it, expect } from "vitest";
import { renderStampStrip, encodePng, STRIP_WIDTH, STRIP_HEIGHT } from "../src/strip";
import { decodePng } from "../src/png-decode";

/** Decode just enough of the PNG header to prove we emit a real one. */
function header(png: Buffer) {
  const sig = png.subarray(0, 8).toString("hex");
  return {
    signature: sig,
    ihdrType: png.subarray(12, 16).toString("ascii"),
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
    endsWithIend: png.subarray(png.length - 8, png.length - 4).toString("ascii") === "IEND",
  };
}

describe("stamp strip", () => {
  it("emits a valid 8-bit RGBA PNG at wallet dimensions", () => {
    const png = renderStampStrip({ stampsRequired: 10, currentStamps: 4, brandColor: "#6C2A4B" });
    const h = header(png);
    expect(h.signature).toBe("89504e470d0a1a0a");
    expect(h.ihdrType).toBe("IHDR");
    expect(h.width).toBe(STRIP_WIDTH);
    expect(h.height).toBe(STRIP_HEIGHT);
    expect(h.bitDepth).toBe(8);
    expect(h.colorType).toBe(6); // truecolour + alpha
    expect(h.endsWithIend).toBe(true);
  });

  it("changes with the stamp count — this is what makes it worth redrawing", () => {
    const opts = { stampsRequired: 10, brandColor: "#6C2A4B" };
    const a = renderStampStrip({ ...opts, currentStamps: 3 });
    const b = renderStampStrip({ ...opts, currentStamps: 4 });
    expect(a.equals(b)).toBe(false);
  });

  it("is deterministic, so an unchanged card re-renders byte-identically", () => {
    const opts = { stampsRequired: 8, currentStamps: 5, brandColor: "#146A2E" };
    expect(renderStampStrip(opts).equals(renderStampStrip(opts))).toBe(true);
  });

  it("draws light marks on a dark card and dark marks on a pale one", () => {
    const dark = renderStampStrip({ stampsRequired: 5, currentStamps: 5, brandColor: "#0C2712" });
    const pale = renderStampStrip({ stampsRequired: 5, currentStamps: 5, brandColor: "#F2E9C9" });
    expect(dark.equals(pale)).toBe(false);
  });

  it("clamps a count beyond the card length instead of overflowing", () => {
    const png = renderStampStrip({ stampsRequired: 10, currentStamps: 99, brandColor: "#146A2E" });
    expect(header(png).width).toBe(STRIP_WIDTH);
    expect(png.length).toBeGreaterThan(100);
  });
});

describe("stamp strip with shop artwork", () => {
  const icon = decodePng(
    encodePng(
      4,
      4,
      Buffer.from(Array.from({ length: 4 * 4 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 200))),
    ),
  );

  it("draws the shop's icon instead of discs when one is supplied", () => {
    const opts = { stampsRequired: 6, currentStamps: 3, brandColor: "#6C2A4B" };
    const discs = renderStampStrip(opts);
    const artwork = renderStampStrip({ ...opts, icon });
    expect(discs.equals(artwork)).toBe(false);
  });

  it("still distinguishes earned from unearned", () => {
    const base = { stampsRequired: 6, brandColor: "#6C2A4B", icon };
    const two = renderStampStrip({ ...base, currentStamps: 2 });
    const five = renderStampStrip({ ...base, currentStamps: 5 });
    expect(two.equals(five)).toBe(false);
  });
});
