import { describe, it, expect } from "vitest";
import {
  renderStampStrip,
  encodePng,
  STRIP_WIDTH,
  STRIP_HEIGHT,
  GOOGLE_STRIP,
  APPLE_STRIP,
  type StampLayout,
} from "../src/strip";
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

  it("uses distinct empty artwork when the shop supplies it", () => {
    const emptyIcon = decodePng(
      encodePng(4, 4, Buffer.from(Array.from({ length: 4 * 4 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 40)))),
    );
    const base = { stampsRequired: 6, currentStamps: 2, brandColor: "#6C2A4B", icon };
    expect(renderStampStrip(base).equals(renderStampStrip({ ...base, emptyIcon }))).toBe(false);
  });

  it("ignores unearnedOpacity once there is real empty artwork to draw", () => {
    const emptyIcon = decodePng(
      encodePng(4, 4, Buffer.from(Array.from({ length: 4 * 4 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 40)))),
    );
    const base = { stampsRequired: 6, currentStamps: 2, brandColor: "#6C2A4B", icon, emptyIcon };
    // The empty image is drawn as the shop drew it — fading it too would double-dip.
    expect(
      renderStampStrip({ ...base, unearnedOpacity: 0.1 }).equals(
        renderStampStrip({ ...base, unearnedOpacity: 0.9 }),
      ),
    ).toBe(true);
  });
});

/*
 * The two wallets want different shapes. These pin the numbers, because a wrong aspect ratio is
 * invisible in code review and only shows up as a badly laid out pass on someone's phone.
 */
describe("per-platform geometry", () => {
  const opts = { stampsRequired: 10, currentStamps: 7, brandColor: "#146A2E" };

  it("renders Google at 1032x812, roughly 5:4", () => {
    const h = header(renderStampStrip({ ...opts, ...GOOGLE_STRIP }));
    expect([h.width, h.height]).toEqual([1032, 812]);
    expect(h.width / h.height).toBeCloseTo(1.27, 2);
  });

  it("renders Apple at 1125x369, roughly 3:1", () => {
    const h = header(renderStampStrip({ ...opts, ...APPLE_STRIP }));
    expect([h.width, h.height]).toEqual([1125, 369]);
    expect(h.width / h.height).toBeCloseTo(3.05, 2);
  });

  it("defaults to Google, which is the platform we issue on", () => {
    expect([STRIP_WIDTH, STRIP_HEIGHT]).toEqual([GOOGLE_STRIP.width, GOOGLE_STRIP.height]);
  });
});

describe("stamp layout", () => {
  const opts = { stampsRequired: 10, currentStamps: 7, brandColor: "#146A2E" };
  const layouts: StampLayout[] = ["row", "grid", "top-heavy", "diamond"];

  it("gives every layout a visibly different arrangement", () => {
    const rendered = layouts.map((layout) => renderStampStrip({ ...opts, layout }).toString("base64"));
    expect(new Set(rendered).size).toBe(layouts.length);
  });

  it("keeps every stamp inside the canvas, whatever the layout or count", () => {
    // A stamp drawn outside the bounds is silently clipped, so count opaque pixels instead: a
    // layout that overflowed would lose them, and the total would drop.
    for (const layout of layouts) {
      for (const stampsRequired of [1, 3, 7, 10, 20]) {
        const png = renderStampStrip({ ...opts, stampsRequired, currentStamps: stampsRequired, layout });
        const img = decodePng(png);
        let opaque = 0;
        for (let i = 3; i < img.rgba.length; i += 4) if (img.rgba[i]! > 200) opaque++;
        expect(opaque, `${layout} with ${stampsRequired}`).toBeGreaterThan(0);
      }
    }
  });

  it("scales the stamps without changing the canvas", () => {
    const small = renderStampStrip({ ...opts, scale: 0.6 });
    const large = renderStampStrip({ ...opts, scale: 1.4 });
    expect(small.equals(large)).toBe(false);
    expect(header(small).width).toBe(header(large).width);
  });

  it("responds to the gap controls independently", () => {
    const base = renderStampStrip(opts);
    expect(renderStampStrip({ ...opts, gapX: 0.5 }).equals(base)).toBe(false);
    expect(renderStampStrip({ ...opts, gapY: 0.5 }).equals(base)).toBe(false);
  });

  it("clamps nonsense values rather than drawing something broken", () => {
    const wild = renderStampStrip({ ...opts, scale: 99, gapX: -5, gapY: 99, unearnedOpacity: 42 });
    expect(header(wild).width).toBe(STRIP_WIDTH);
    expect(wild.length).toBeGreaterThan(100);
  });
});
