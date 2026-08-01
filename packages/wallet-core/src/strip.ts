import { deflateSync } from "node:zlib";
import { decodePng, type DecodedImage } from "./png-decode";

/**
 * The stamp strip — the only way a wallet pass can show actual stamps.
 *
 * Neither Google nor Apple can draw stamp circles from data; both render points as a number. What
 * they DO accept is a wide banner image (Google `heroImage`, Apple `strip.png`), so we draw the
 * stamps ourselves and hand over a picture that is redrawn every time the count changes.
 *
 * Written as a tiny PNG encoder on node:zlib rather than pulling in sharp or resvg: the drawing is
 * circles on a transparent field, and a native image dependency would be the API's first — with all
 * the Docker and deploy weight that carries — for something this simple.
 *
 * DELIBERATE LIMIT: no text or emoji. Rasterising a glyph needs a font engine, and colour-emoji
 * fonts are exactly the case those engines handle worst. Filled discs read better at strip size
 * anyway; the shop's chosen icon lives on the app card, where a browser does the work.
 */

/**
 * The two wallets want different shapes, so there is no single strip that serves both.
 *
 * Google's loyalty brand guidance gives heroImage as 1032x812, "approximately 5:4". Apple's
 * storeCard strip is 375x123pt, which at @3x is 1125x369 — roughly 3:1. A 3:1 image sent to Google
 * is letterboxed into a 5:4 slot with dead bands above and below, which is exactly what a wrongly
 * sized strip looks like on a real pass. Render per platform instead of scaling one to fit both.
 */
export const GOOGLE_STRIP = { width: 1032, height: 812 } as const;
export const APPLE_STRIP = { width: 1125, height: 369 } as const;

/** Default geometry. Google is the platform we actually issue on today. */
export const STRIP_WIDTH = GOOGLE_STRIP.width;
export const STRIP_HEIGHT = GOOGLE_STRIP.height;

/**
 * How the stamps are arranged. A near-square Google canvas affords a real grid; a letterbox Apple
 * strip suits a single row. The shop picks the shape they want and each platform renders it into
 * its own geometry.
 */
export type StampLayout = "row" | "grid" | "top-heavy" | "diamond";

export interface StripOptions {
  stampsRequired: number;
  currentStamps: number;
  /** The shop's brand colour — the strip sits on it, so the marks are drawn to contrast. */
  brandColor: string;
  /**
   * The shop's own stamp artwork, already decoded. Given one, the strip draws THAT instead of
   * discs — which is how a real stamp card reads: a row of the shop's cups filling up, not
   * abstract circles.
   */
  icon?: DecodedImage;
  /**
   * Artwork for a stamp not yet earned. Without one, the earned artwork is drawn faded, which
   * keeps the row reading as one set filling up. With one, a shop can supply a proper outline.
   */
  emptyIcon?: DecodedImage;
  layout?: StampLayout;
  /** Stamp size within its cell. 1 is the default; below 1 is smaller, above 1 is larger. */
  scale?: number;
  /** Share of each cell left empty, horizontally and vertically. 0 to 0.6. */
  gapX?: number;
  gapY?: number;
  /** How strongly a not-yet-earned stamp shows. Ignored when emptyIcon is supplied. */
  unearnedOpacity?: number;
  width?: number;
  height?: number;
}

/** Stamps per row, top to bottom. Rows are centred, so a short row sits under a long one. */
function rowsFor(total: number, layout: StampLayout): number[] {
  switch (layout) {
    case "row":
      return [total];
    case "top-heavy": {
      // The +1 matters: plain ceil(total/2) splits an even count evenly, which is just the grid.
      const top = Math.ceil((total + 1) / 2);
      return [top, total - top].filter((n) => n > 0);
    }
    case "diamond": {
      if (total <= 3) return [total];
      // Three rows with the surplus going to the middle first, so 10 reads 3-4-3.
      const base = Math.floor(total / 3);
      const rows = [base, base, base];
      const extra = total % 3;
      if (extra >= 1) rows[1]! += 1;
      if (extra >= 2) rows[0]! += 1;
      return rows.filter((n) => n > 0);
    }
    default: {
      const perRow = total <= 5 ? total : Math.ceil(total / 2);
      const rows: number[] = [];
      for (let left = total; left > 0; left -= perRow) rows.push(Math.min(perRow, left));
      return rows;
    }
  }
}

function clamp(n: number | undefined, lo: number, hi: number, fallback: number): number {
  return n === undefined || !Number.isFinite(n) ? fallback : Math.max(lo, Math.min(hi, n));
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseHex(hex: string): Rgba {
  const c = hex.replace("#", "");
  if (c.length < 6) return { r: 20, g: 106, b: 46, a: 255 };
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return { r: r!, g: g!, b: b!, a: 255 };
}

/** Whether to draw the marks in dark or light, given what they sit on. */
function isPale({ r, g, b }: Rgba): boolean {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

/**
 * Draw the strip and encode it as a PNG.
 *
 * Filled stamps are solid discs; remaining ones are rings. Both are drawn with a coverage-based
 * edge (a cheap analytic antialias) so they don't look jagged at the size a wallet renders them.
 */
export function renderStampStrip(opts: StripOptions): Buffer {
  const width = opts.width ?? STRIP_WIDTH;
  const height = opts.height ?? STRIP_HEIGHT;
  const total = Math.max(1, Math.min(opts.stampsRequired, 20));
  const filled = Math.max(0, Math.min(opts.currentStamps, total));
  const brand = parseHex(opts.brandColor);
  const ink: Rgba = isPale(brand) ? { r: 28, g: 26, b: 21, a: 255 } : { r: 255, g: 255, b: 255, a: 255 };

  const rows = rowsFor(total, opts.layout ?? "grid");
  const scale = clamp(opts.scale, 0.5, 1.4, 1);
  const gapX = clamp(opts.gapX, 0, 0.6, 0.18);
  const gapY = clamp(opts.gapY, 0, 0.6, 0.18);
  const unearned = clamp(opts.unearnedOpacity, 0.05, 1, 0.28);

  /*
   * Square cells sized to whichever axis runs out first, then the whole block centred.
   *
   * Spreading the rows over the full canvas height instead looks fine on a 3:1 strip and badly
   * wrong on Google's near-square one: two rows of five end up at the very top and very bottom
   * with a dead band between them. Sizing each row to its own width is the other trap — a
   * three-stamp row would draw bigger stamps than a four-stamp row and the diamond would come
   * out as a lumpy grid.
   */
  const pad = Math.min(width, height) * 0.05;
  const widest = Math.max(...rows);
  const box =
    Math.min((width - pad * 2) / (widest * (1 + gapX)), (height - pad * 2) / (rows.length * (1 + gapY))) *
    scale;
  const pitchX = box * (1 + gapX);
  const pitchY = box * (1 + gapY);
  const top = (height - pitchY * rows.length) / 2;
  const radius = box / 2;
  const ring = Math.max(3, radius * 0.13);
  // A ring reads fainter than a solid disc at the same alpha, so it is lifted above the artwork
  // fade — 0.28 lands on the 150 this drew before the control existed.
  const ringAlpha = Math.round(255 * Math.min(1, unearned * 2.1));

  const px = Buffer.alloc(width * height * 4); // transparent — the card colour shows through

  const put = (x: number, y: number, col: Rgba, coverage: number) => {
    if (coverage <= 0 || x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const a = Math.min(1, coverage) * (col.a / 255);
    // source-over onto whatever is already there
    const dstA = px[i + 3]! / 255;
    const outA = a + dstA * (1 - a);
    if (outA <= 0) return;
    px[i] = Math.round((col.r * a + px[i]! * dstA * (1 - a)) / outA);
    px[i + 1] = Math.round((col.g * a + px[i + 1]! * dstA * (1 - a)) / outA);
    px[i + 2] = Math.round((col.b * a + px[i + 2]! * dstA * (1 - a)) / outA);
    px[i + 3] = Math.round(outA * 255);
  };

  let n = 0;
  for (let r = 0; r < rows.length; r++) {
    const count = rows[r]!;
    const rowLeft = (width - count * pitchX) / 2; // centred, so short rows sit under long ones
    const cy = top + pitchY * r + pitchY / 2;

    for (let c = 0; c < count; c++, n++) {
      const cx = rowLeft + pitchX * c + pitchX / 2;
      const on = n < filled;

      if (opts.icon) {
        // A shop that supplies distinct empty artwork gets it drawn solid; otherwise the earned
        // artwork is held back, so the row still reads as one set filling up.
        const art = on ? opts.icon : (opts.emptyIcon ?? opts.icon);
        const strength = on || opts.emptyIcon ? 1 : unearned;
        drawIcon(put, art, cx, cy, radius * 2, strength);
        continue;
      }

      const x0 = Math.max(0, Math.floor(cx - radius - 2));
      const x1 = Math.min(width - 1, Math.ceil(cx + radius + 2));
      const y0 = Math.max(0, Math.floor(cy - radius - 2));
      const y1 = Math.min(height - 1, Math.ceil(cy + radius + 2));

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (on) {
            // solid disc, feathered over the final pixel
            put(x, y, ink, radius - d);
          } else {
            // ring: inside the outer edge but outside the inner one
            const outer = radius - d;
            const inner = d - (radius - ring);
            put(x, y, { ...ink, a: ringAlpha }, Math.min(outer, inner));
          }
        }
      }
    }
  }

  return encodePng(width, height, px);
}

/**
 * Blit an icon centred on (cx, cy), scaled to fit `size` and sampled bilinearly so it doesn't go
 * blocky when a small source is scaled up to strip resolution.
 */
function drawIcon(
  put: (x: number, y: number, col: Rgba, coverage: number) => void,
  icon: DecodedImage,
  cx: number,
  cy: number,
  size: number,
  opacity: number,
): void {
  // Preserve the artwork's aspect: a tall cup must not be squashed into a square.
  const scale = size / Math.max(icon.width, icon.height);
  const w = icon.width * scale;
  const h = icon.height * scale;
  const left = cx - w / 2;
  const top = cy - h / 2;

  for (let y = Math.floor(top); y < Math.ceil(top + h); y++) {
    for (let x = Math.floor(left); x < Math.ceil(left + w); x++) {
      const u = ((x + 0.5 - left) / w) * (icon.width - 1);
      const v = ((y + 0.5 - top) / h) * (icon.height - 1);
      if (u < 0 || v < 0 || u > icon.width - 1 || v > icon.height - 1) continue;

      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(x0 + 1, icon.width - 1);
      const y1 = Math.min(y0 + 1, icon.height - 1);
      const fx = u - x0;
      const fy = v - y0;

      const at = (px: number, py: number, c: number) => icon.rgba[(py * icon.width + px) * 4 + c]!;
      const mix = (c: number) =>
        at(x0, y0, c) * (1 - fx) * (1 - fy) +
        at(x1, y0, c) * fx * (1 - fy) +
        at(x0, y1, c) * (1 - fx) * fy +
        at(x1, y1, c) * fx * fy;

      const alpha = mix(3) / 255;
      if (alpha <= 0.004) continue;
      put(x, y, { r: mix(0), g: mix(1), b: mix(2), a: 255 }, alpha * opacity);
    }
  }
}

// ── a minimal PNG encoder (8-bit RGBA, no interlace) ───────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 (None) keeps the encoder simple and still
  // compresses well here, because flat colour runs dominate.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Where a wallet fetches this card's strip.
 *
 * Lives beside the renderer so the URL format and the image can never drift apart, and so both the
 * card read and the sync worker can build it without either depending on the other.
 *
 * Google downloads the image itself, so with no PUBLIC_API_URL configured (local dev) this returns
 * undefined and the pass simply has no strip — better than pointing Google at an unreachable host.
 *
 * The count rides along purely as a cache-buster: the bytes change on every scan, and a CDN would
 * otherwise keep serving the strip drawn before it.
 */
export function stripUrlFor(serial: string, currentStamps: number): string | undefined {
  const base = process.env.PUBLIC_API_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/card/${encodeURIComponent(serial)}/strip.png?s=${currentStamps}`;
}
