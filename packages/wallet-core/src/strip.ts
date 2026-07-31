import { deflateSync } from "node:zlib";

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

/** Google's heroImage guidance; Apple's strip is smaller and scales down cleanly from this. */
export const STRIP_WIDTH = 1032;
export const STRIP_HEIGHT = 336;

export interface StripOptions {
  stampsRequired: number;
  currentStamps: number;
  /** The shop's brand colour — the strip sits on it, so the marks are drawn to contrast. */
  brandColor: string;
  width?: number;
  height?: number;
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

  // Lay the stamps out in one or two rows, whichever keeps them largest.
  const perRow = total <= 5 ? total : Math.ceil(total / 2);
  const rows = Math.ceil(total / perRow);
  const cellW = width / perRow;
  const cellH = height / rows;
  const radius = Math.min(cellW, cellH) * 0.34;
  const ring = Math.max(3, radius * 0.13);

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

  for (let n = 0; n < total; n++) {
    const row = Math.floor(n / perRow);
    const col = n % perRow;
    const cx = cellW * col + cellW / 2;
    const cy = cellH * row + cellH / 2;
    const on = n < filled;

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
          put(x, y, { ...ink, a: 150 }, Math.min(outer, inner));
        }
      }
    }
  }

  return encodePng(width, height, px);
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
