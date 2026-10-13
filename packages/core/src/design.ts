import type { StampLayout } from "@qrew/wallet-core";

/*
 * The card design, and how a stored one is read back. Kept free of the database and the wallet
 * provider so that anything — the card read, the pass builder, the strip — can use it without
 * pulling in either, or importing program.ts back.
 */

/**
 * The shop's design INTENT. Deliberately platform-agnostic: every field here is expressible on the
 * app card, a Google loyalty class, an Apple store card AND the printed poster. Adapters translate;
 * this never mentions heroImage, strip.png or textModulesData.
 */
export interface CardDesign {
  brandColor: string; // hex, e.g. "#146A2E"
  stampIcon: string; // emoji, e.g. "☕"
  /** Public https image — the shop's mark on the card, the passes and the poster. */
  logoUrl?: string;
  /**
   * The shop's stamp artwork (square transparent PNG). Drawn into the wallet stamp strip so a pass
   * shows their cup or pastry filling up rather than generic discs.
   */
  stampImageUrl?: string;
  /**
   * Artwork for a stamp not yet earned. Without one the earned artwork is drawn faded, which keeps
   * the row reading as one set filling up; with one, the shop controls both states.
   */
  emptyStampImageUrl?: string;
  /**
   * A finished strip the shop drew themselves, used verbatim instead of anything we compose.
   *
   * The escape hatch for a shop with a designer: whatever we generate will never beat artwork made
   * for the exact card. It costs them the live stamp count — the image cannot change as they earn —
   * which is why it is opt-in rather than the default.
   */
  customStripUrl?: string;
  /** How the stamps are arranged on the pass. */
  stampLayout?: StampLayout;
  /** Stamp size within its cell; 1 is the default. */
  stampScale?: number;
  /** Share of each cell left empty, horizontally and vertically. */
  stampGapX?: number;
  stampGapY?: number;
  /** How strongly a not-yet-earned stamp shows. Ignored once emptyStampImageUrl is set. */
  unearnedOpacity?: number;
  /** Extra rows shown on the pass (Google text modules / Apple back fields). Max 4. */
  details?: { label: string; value: string }[];
  /** Shop location, for the "you're nearby" lock-screen reminder both wallets support. */
  location?: { lat: number; lng: number; label?: string } | null;
}

// Qrew forest green — an un-customized card is on-brand out of the box.
export const DEFAULT_DESIGN: CardDesign = { brandColor: "#146A2E", stampIcon: "☕" };

const LAYOUTS: StampLayout[] = ["row", "grid", "top-heavy", "diamond"];

/** A stored number is only kept when it is a real number in range — a bad one falls back silently. */
function num(v: unknown, lo: number, hi: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
}

/**
 * An image link is only kept when it is a whole http(s) URL. A data:, javascript: or half-typed link
 * — the designer previews on every keystroke — is treated as unset, so it falls back to the plain
 * stamps rather than reaching a fetch or a pass.
 */
function imageUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || !v || v.length > 500) return undefined;
  try {
    const { protocol } = new URL(v);
    return protocol === "https:" || protocol === "http:" ? v : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeDesign(raw: unknown): CardDesign {
  const d = (raw ?? {}) as Partial<CardDesign>;
  const details = Array.isArray(d.details)
    ? d.details
        .filter((r): r is { label: string; value: string } => Boolean(r?.label && r?.value))
        .slice(0, 4)
    : undefined;
  const scale = num(d.stampScale, 0.5, 1.4);
  const gapX = num(d.stampGapX, 0, 0.6);
  const gapY = num(d.stampGapY, 0, 0.6);
  const unearned = num(d.unearnedOpacity, 0.05, 1);
  const logo = imageUrl(d.logoUrl);
  const stamp = imageUrl(d.stampImageUrl);
  const emptyStamp = imageUrl(d.emptyStampImageUrl);
  const customStrip = imageUrl(d.customStripUrl);
  return {
    brandColor: typeof d.brandColor === "string" ? d.brandColor : DEFAULT_DESIGN.brandColor,
    stampIcon: typeof d.stampIcon === "string" ? d.stampIcon : DEFAULT_DESIGN.stampIcon,
    // An empty string means "cleared" — store it as absent so adapters fall back cleanly.
    ...(logo ? { logoUrl: logo } : {}),
    ...(stamp ? { stampImageUrl: stamp } : {}),
    ...(emptyStamp ? { emptyStampImageUrl: emptyStamp } : {}),
    ...(customStrip ? { customStripUrl: customStrip } : {}),
    ...(d.stampLayout && LAYOUTS.includes(d.stampLayout) ? { stampLayout: d.stampLayout } : {}),
    ...(scale !== undefined ? { stampScale: scale } : {}),
    ...(gapX !== undefined ? { stampGapX: gapX } : {}),
    ...(gapY !== undefined ? { stampGapY: gapY } : {}),
    ...(unearned !== undefined ? { unearnedOpacity: unearned } : {}),
    ...(details && details.length ? { details } : {}),
    ...(d.location ? { location: d.location } : {}),
  };
}
