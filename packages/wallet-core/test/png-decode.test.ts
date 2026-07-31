import { describe, it, expect } from "vitest";
import { encodePng } from "../src/strip";
import { decodePng } from "../src/png-decode";

/** Build a tiny RGBA image with known pixels so a round-trip can be checked exactly. */
function swatch(w: number, h: number) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = (i * 7) % 256;
    rgba[i * 4 + 1] = (i * 13) % 256;
    rgba[i * 4 + 2] = (i * 29) % 256;
    rgba[i * 4 + 3] = i % 2 ? 255 : 128; // exercise partial alpha
  }
  return rgba;
}

describe("png decode", () => {
  it("round-trips an image through encode → decode byte for byte", () => {
    const [w, h] = [23, 17]; // deliberately not a power of two, to catch stride bugs
    const rgba = swatch(w, h);
    const decoded = decodePng(encodePng(w, h, rgba));
    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(decoded.rgba.equals(rgba)).toBe(true);
  });

  it("preserves alpha, which is the whole point for stamp artwork", () => {
    const rgba = Buffer.from([255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 9, 9, 9, 40]);
    const decoded = decodePng(encodePng(2, 2, rgba));
    expect([...decoded.rgba.subarray(0, 4)]).toEqual([255, 0, 0, 0]);
    expect(decoded.rgba[7]).toBe(128);
    expect(decoded.rgba[15]).toBe(40);
  });

  it("rejects a non-PNG rather than emitting garbage pixels", () => {
    expect(() => decodePng(Buffer.from("this is not an image"))).toThrow(/not a PNG/i);
  });
});
