import { describe, it, expect, vi, afterEach } from "vitest";
import { encodePng } from "../src/strip";
import { decodePng, loadIcon } from "../src/png-decode";

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

  const ok = (body: Buffer) =>
    ({ ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) }) as Response;

  /** A distinct URL per test — the cache is module-level and deliberately never cleared. */
  let n = 0;
  const url = () => `https://shop.test/stamp-${n++}.png`;

  it("fetches once and serves every later render from memory", async () => {
    const png = encodePng(2, 2, swatch(2, 2));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok(png));
    const u = url();

    const first = await loadIcon(u);
    const second = await loadIcon(u);

    expect(first?.width).toBe(2);
    expect(second).toBe(first); // the same decoded object, not a re-decode
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to no artwork when the fetch fails, rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadIcon(url())).resolves.toBeUndefined();
  });

  it("does not hammer a dead URL on every render", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 404 } as Response);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const u = url();

    await loadIcon(u);
    await loadIcon(u);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after the cooldown, so a blip in the shop's host is not permanent", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const png = encodePng(2, 2, swatch(2, 2));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(ok(png));
    const u = url();

    expect(await loadIcon(u)).toBeUndefined();
    vi.advanceTimersByTime(61_000);
    expect((await loadIcon(u))?.width).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips the fetch entirely when the shop has set no artwork", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await loadIcon(undefined)).toBeUndefined();
    expect(await loadIcon("")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
