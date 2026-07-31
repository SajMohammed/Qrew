import { inflateSync } from "node:zlib";

/**
 * A minimal PNG decoder — the other half of the encoder next door.
 *
 * It exists so a shop's own stamp artwork can be composited into the strip: real wallet stamp cards
 * show the merchant's cup or pastry, not a generic disc, and that means reading their image.
 *
 * PNG only, deliberately. Decoding JPEG by hand means Huffman tables and an inverse DCT — hundreds
 * of lines to get subtly wrong — whereas PNG is inflate plus five row filters, which is this file.
 * Shops upload a square transparent PNG, which is what icon artwork is exported as anyway.
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA, 4 bytes per pixel. */
  rgba: Buffer;
}

/** Undo a PNG row filter. Each scanline picks its own, so all five must be supported. */
function unfilter(type: number, line: Buffer, prev: Buffer, bpp: number): void {
  for (let i = 0; i < line.length; i++) {
    const a = i >= bpp ? line[i - bpp]! : 0; // left
    const b = prev[i] ?? 0; // above
    const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0; // above-left
    let value = line[i]!;
    switch (type) {
      case 0:
        break; // None
      case 1:
        value += a;
        break; // Sub
      case 2:
        value += b;
        break; // Up
      case 3:
        value += (a + b) >> 1;
        break; // Average
      case 4: {
        // Paeth
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        break;
      }
      default:
        throw new Error(`unsupported PNG row filter ${type}`);
    }
    line[i] = value & 0xff;
  }
}

export function decodePng(buf: Buffer): DecodedImage {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("not a PNG (bad signature)");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let paletteAlpha: Buffer | null = null;
  const idat: Buffer[] = [];

  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString("ascii");
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") paletteAlpha = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    pos += 12 + len; // length + type + data + crc
  }

  // Guard rails rather than silent corruption: these are the shapes real icon exports produce.
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth} (need 8)`);
  if (interlace !== 0) throw new Error("interlaced PNG is not supported — re-export without Adam7");

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);

  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    const filter = raw[at]!;
    const line = Buffer.from(raw.subarray(at + 1, at + 1 + stride));
    unfilter(filter, line, prev, bpp);
    prev = line;

    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const i = x * bpp;
      switch (colorType) {
        case 0: // greyscale
          rgba[o] = rgba[o + 1] = rgba[o + 2] = line[i]!;
          rgba[o + 3] = 255;
          break;
        case 2: // RGB
          rgba[o] = line[i]!;
          rgba[o + 1] = line[i + 1]!;
          rgba[o + 2] = line[i + 2]!;
          rgba[o + 3] = 255;
          break;
        case 3: {
          // palette
          const idx = line[i]!;
          rgba[o] = palette?.[idx * 3] ?? 0;
          rgba[o + 1] = palette?.[idx * 3 + 1] ?? 0;
          rgba[o + 2] = palette?.[idx * 3 + 2] ?? 0;
          rgba[o + 3] = paletteAlpha?.[idx] ?? 255;
          break;
        }
        case 4: // grey + alpha
          rgba[o] = rgba[o + 1] = rgba[o + 2] = line[i]!;
          rgba[o + 3] = line[i + 1]!;
          break;
        default: // 6: RGBA
          rgba[o] = line[i]!;
          rgba[o + 1] = line[i + 1]!;
          rgba[o + 2] = line[i + 2]!;
          rgba[o + 3] = line[i + 3]!;
      }
    }
  }

  return { width, height, rgba };
}

/**
 * Fetch and decode a shop's stamp artwork, memoised by URL.
 *
 * The strip is redrawn on every wallet fetch, so without a cache each render would re-download the
 * shop's icon. Keyed on the URL, so changing the artwork changes the key and the new image is
 * picked up without any invalidation step.
 *
 * Never throws: artwork is decoration on top of a strip that already works. A broken link, a JPEG,
 * or a slow host degrades to the plain discs rather than failing the customer's card.
 */
const iconCache = new Map<string, DecodedImage>();
/** Failures are remembered only briefly — see below. */
const failedUntil = new Map<string, number>();
const FAILURE_COOLDOWN_MS = 60_000;

export async function loadIcon(url: string | undefined): Promise<DecodedImage | undefined> {
  if (!url) return undefined;

  const hit = iconCache.get(url);
  if (hit) return hit;

  /*
   * Failures are cached too, or a dead link would be re-fetched on every single strip render — but
   * only for a minute. Caching them forever would let one blip in the shop's host disable their
   * artwork until the process restarts.
   */
  const cooling = failedUntil.get(url);
  if (cooling !== undefined && Date.now() < cooling) return undefined;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const decoded = decodePng(Buffer.from(await res.arrayBuffer()));
    iconCache.set(url, decoded);
    failedUntil.delete(url);
    return decoded;
  } catch (err) {
    console.error(`[wallet] could not load stamp artwork ${url}:`, err instanceof Error ? err.message : err);
    failedUntil.set(url, Date.now() + FAILURE_COOLDOWN_MS);
    return undefined;
  }
}
