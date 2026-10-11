import { describe, it, expect, vi, afterEach } from "vitest";
import { encodePng } from "../src/strip";
import { decodePng, loadIcon, readPngSize } from "../src/png-decode";

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

describe("loadIcon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A distinct URL per test — the cache is module-level and deliberately never cleared. */
  let n = 0;
  const url = () => `https://shop.test/stamp-${n++}.png`;

  // The byte source is injected, so these exercise the cache and cooldown alone; the network
  // policy behind the default source has its own tests (artwork-fetch.test.ts).
  it("fetches once and serves every later render from memory", async () => {
    const png = encodePng(2, 2, swatch(2, 2));
    const source = vi.fn(async () => png);
    const u = url();

    const first = await loadIcon(u, source);
    const second = await loadIcon(u, source);

    expect(first?.width).toBe(2);
    expect(second).toBe(first); // the same decoded object, not a re-decode
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("falls back to no artwork when the fetch fails, rather than throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadIcon(url(), async () => Promise.reject(new Error("ENOTFOUND")))).resolves.toBeUndefined();
  });

  it("does not hammer a dead URL on every render", async () => {
    const source = vi.fn(async (): Promise<Buffer> => Promise.reject(new Error("fetch 404")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const u = url();

    await loadIcon(u, source);
    await loadIcon(u, source);

    expect(source).toHaveBeenCalledTimes(1);
  });

  it("retries after the cooldown, so a blip in the shop's host is not permanent", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const png = encodePng(2, 2, swatch(2, 2));
    const source = vi
      .fn<(u: string) => Promise<Buffer>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(png);
    const u = url();

    expect(await loadIcon(u, source)).toBeUndefined();
    vi.advanceTimersByTime(61_000);
    expect((await loadIcon(u, source))?.width).toBe(2);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("skips the fetch entirely when the shop has set no artwork", async () => {
    const source = vi.fn(async () => Buffer.alloc(0));
    expect(await loadIcon(undefined, source)).toBeUndefined();
    expect(await loadIcon("", source)).toBeUndefined();
    expect(source).not.toHaveBeenCalled();
  });

  it("refuses a link to a private address by default, without fetching it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadIcon(`https://169.254.169.254/latest/meta-data-${n++}`)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/** A PNG header declaring any size, with no real image behind it. */
function lyingHeader(width: number, height: number): Buffer {
  const png = encodePng(1, 1, Buffer.from([0, 0, 0, 255]));
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

describe("png decode limits", () => {
  it("reads the declared size from the header without decoding", () => {
    expect(readPngSize(encodePng(23, 17, swatch(23, 17)))).toEqual({ width: 23, height: 17 });
  });

  it("refuses a huge declared size before allocating for it", () => {
    // 65535×65535 would ask for 17 GB of RGBA if the header were trusted.
    expect(() => decodePng(lyingHeader(65535, 65535))).toThrow(/most we read is 2048×2048/);
  });

  it("refuses a chunk that runs past the end of the file", () => {
    const png = encodePng(4, 4, swatch(4, 4));
    expect(() => decodePng(png.subarray(0, png.length - 20))).toThrow(/truncated/i);
  });

  it("refuses image data that inflates to more than the header allows", () => {
    // A 1×1 header in front of a 64×64 image's data: the inflate stops at the 1×1 size instead of
    // expanding whatever it was given.
    const big = encodePng(64, 64, swatch(64, 64));
    const small = encodePng(1, 1, Buffer.from([0, 0, 0, 255]));
    const forged = Buffer.concat([small.subarray(0, 33), big.subarray(33)]);
    expect(() => decodePng(forged)).toThrow();
  });
});
