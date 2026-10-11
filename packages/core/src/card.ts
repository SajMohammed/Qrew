import { eq } from "drizzle-orm";
import { adminDb, merchants, loyaltyPrograms, enrollments, customers } from "@qrew/db";
import {
  getWalletProvider,
  renderStampStrip,
  loadIcon,
  loadRawImage,
  GOOGLE_STRIP,
  APPLE_STRIP,
  fetchArtwork,
} from "@qrew/wallet-core";
import { getAsset, ownAssetId } from "./asset";
import { mintCardToken } from "./token";
import { normalizeDesign, type CardDesign } from "./design";
import { isWalletIssuable, passContentFor, type PassSource } from "./wallet-pass";
import { cardTypeModule, isCardType } from "./card-types";
import { formatShortCode } from "./short-code";

/** Which wallet the strip is being drawn for — they want different aspect ratios. */
export type StripPlatform = "google" | "apple";

export interface CardView {
  serial: string;
  /** Short-lived signed token to render in the QR (rotates as the card polls). */
  qrToken: string;
  /** What a cashier types when the QR won't scan, formatted: "K7M 4QX". */
  shortCode: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  bonusStamps: number;
  rewardReady: boolean;
  brandColor: string; // per-merchant theming (from the card designer)
  stampIcon: string;
  /** The shop's artwork, when they have supplied it. Takes precedence over the emoji. */
  stampImageUrl?: string;
  emptyStampImageUrl?: string;
  /** Add-to-Wallet links — null under the fake provider; a real save URL once wired. */
  wallet: { apple: string | null; google: string | null };
}

/**
 * How long a card read waits for the Add-to-Wallet link. The link needs the programme's Google
 * class, which on a cold process is a token exchange plus a lookup — fine normally, but during a
 * Google slowdown it would hold the customer's card page (and every poll of it) for seconds. Past
 * this the card renders without the button, and the next poll tries again.
 */
export const SAVE_LINK_DEADLINE_MS = 2_000;

/** The card's row, joined to everything a card page or a wallet pass shows. */
async function readCard(serial: string) {
  const [row] = await adminDb
    .select({
      serial: enrollments.cardSerial,
      shortCode: enrollments.shortCode,
      programId: enrollments.programId,
      customerName: customers.name,
      currentStamps: enrollments.currentProgress,
      merchantName: merchants.name,
      programName: loyaltyPrograms.name,
      rewardText: loyaltyPrograms.rewardText,
      stampsRequired: loyaltyPrograms.stampsRequired,
      bonusStamps: loyaltyPrograms.bonusStamps,
      cardDesign: loyaltyPrograms.cardDesign,
      type: loyaltyPrograms.type,
      mechanics: loyaltyPrograms.mechanics,
    })
    .from(enrollments)
    .innerJoin(merchants, eq(merchants.id, enrollments.merchantId))
    .innerJoin(customers, eq(customers.id, enrollments.customerId))
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .where(eq(enrollments.cardSerial, serial));
  return row;
}

type CardRow = NonNullable<Awaited<ReturnType<typeof readCard>>>;

/** The card row as the shared pass builders read it. */
function passSource(row: CardRow): PassSource {
  return { ...row, currentProgress: row.currentStamps };
}

/** Resolve to `fallback` if `work` hasn't settled within `ms`. The work itself carries on. */
function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Public read of a card by its serial. The serial is an unguessable capability token
 * (a random UUID = the card's bearer secret), so this reads via adminDb filtered strictly
 * by serial — the serial itself is the authorization, no tenant/session needed.
 *
 * Never by short code: that is six guessable characters, accepted only by a shop's own scan.
 */
export async function getCard(serial: string): Promise<CardView | null> {
  const row = await readCard(serial);
  if (!row) return null;

  const design = normalizeDesign(row.cardDesign);
  const qrToken = mintCardToken(row.serial);

  /*
   * The save link embeds the card's CURRENT state, so it is built per read rather than stored — a
   * customer who adds the card after earning three stamps gets a pass showing three, not zero.
   * getSaveUrl answers null on any failure, and the deadline caps a slow one, so a wallet outage
   * costs the button, never the card.
   */
  const google = isWalletIssuable(row.type)
    ? await withDeadline(getWalletProvider().getSaveUrl(passContentFor(passSource(row), qrToken)), SAVE_LINK_DEADLINE_MS, null)
    : null;

  return {
    serial: row.serial,
    qrToken,
    shortCode: formatShortCode(row.shortCode),
    merchantName: row.merchantName,
    programName: row.programName,
    rewardText: row.rewardText,
    currentStamps: row.currentStamps,
    stampsRequired: row.stampsRequired,
    bonusStamps: row.bonusStamps,
    rewardReady: row.currentStamps >= row.stampsRequired,
    brandColor: design.brandColor,
    stampIcon: design.stampIcon,
    ...(design.stampImageUrl ? { stampImageUrl: design.stampImageUrl } : {}),
    ...(design.emptyStampImageUrl ? { emptyStampImageUrl: design.emptyStampImageUrl } : {}),
    wallet: { apple: null, google }, // Apple needs the $99/yr programme — not wired yet
  };
}



/** The stamp strip for a card, as PNG bytes. Public — the serial is the capability, as with getCard. */
export async function getCardStrip(
  serial: string,
  platform: StripPlatform = "google",
): Promise<Buffer | null> {
  const [row] = await adminDb
    .select({
      currentStamps: enrollments.currentProgress,
      stampsRequired: loyaltyPrograms.stampsRequired,
      cardDesign: loyaltyPrograms.cardDesign,
      type: loyaltyPrograms.type,
    })
    .from(enrollments)
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .where(eq(enrollments.cardSerial, serial));
  if (!row) return null;

  // A card that is not drawn as stamps has no strip. Answering with one anyway would let a URL
  // saved onto an older pass keep serving a picture that contradicts the product.
  if (!cardTypeModule(isCardType(row.type) ? row.type : "stamp").drawsStampStrip) return null;

  return stripFor(normalizeDesign(row.cardDesign), row.stampsRequired, row.currentStamps, platform);
}

/**
 * Where a design's artwork bytes come from: our own uploads straight from Postgres, anything a shop
 * pasted through the guarded fetch (https only, public hosts only, size-capped — see fetchArtwork).
 */
async function artworkBytes(url: string): Promise<Buffer> {
  const id = ownAssetId(url);
  if (!id) return fetchArtwork(url);
  const asset = await getAsset(id);
  if (!asset) throw new Error(`asset ${id} not found`);
  return asset.bytes;
}

/**
 * Draw a design's strip. Shared by the live card and the designer's preview, so what a shop sees
 * while editing is the same code path the wallet fetches — not a mock that can drift from it.
 */
export async function stripFor(
  design: CardDesign,
  stampsRequired: number,
  currentStamps: number,
  platform: StripPlatform = "google",
): Promise<Buffer | null> {
  /*
   * A shop that supplied a finished strip gets it back untouched. They have traded the live stamp
   * count for full control of the artwork, so compositing on top would defeat the choice.
   */
  if (design.customStripUrl) {
    const custom = await loadRawImage(design.customStripUrl, artworkBytes);
    if (custom) return custom;
    // Unreachable artwork falls through to a generated strip rather than leaving the pass blank.
  }

  const [icon, emptyIcon] = await Promise.all([
    loadIcon(design.stampImageUrl, artworkBytes),
    loadIcon(design.emptyStampImageUrl, artworkBytes),
  ]);

  return renderStampStrip({
    ...(platform === "apple" ? APPLE_STRIP : GOOGLE_STRIP),
    stampsRequired,
    currentStamps,
    brandColor: design.brandColor,
    // Undefined when unset or unreachable — the strip falls back to discs rather than failing.
    icon,
    emptyIcon,
    layout: design.stampLayout,
    scale: design.stampScale,
    gapX: design.stampGapX,
    gapY: design.stampGapY,
    unearnedOpacity: design.unearnedOpacity,
  });
}
