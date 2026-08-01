import { eq } from "drizzle-orm";
import { adminDb, merchants, loyaltyPrograms, enrollments, customers } from "@qrew/db";
import { getWalletProvider, renderStampStrip, stripUrlFor, loadIcon } from "@qrew/wallet-core";
import { mintCardToken } from "./token";
import { normalizeDesign } from "./program";

export interface CardView {
  serial: string;
  /** Short-lived signed token to render in the QR (rotates as the card polls). */
  qrToken: string;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  bonusStamps: number;
  rewardReady: boolean;
  brandColor: string; // per-merchant theming (from the card designer)
  stampIcon: string;
  /** Add-to-Wallet links — null under the fake provider; a real save URL once wired. */
  wallet: { apple: string | null; google: string | null };
}

/**
 * Public read of a card by its serial. The serial is an unguessable capability token
 * (a random UUID = the card's bearer secret), so this reads via adminDb filtered strictly
 * by serial — the serial itself is the authorization, no tenant/session needed.
 */
export async function getCard(serial: string): Promise<CardView | null> {
  const [row] = await adminDb
    .select({
      serial: enrollments.cardSerial,
      programId: enrollments.programId,
      customerName: customers.name,
      currentStamps: enrollments.currentProgress,
      merchantName: merchants.name,
      programName: loyaltyPrograms.name,
      rewardText: loyaltyPrograms.rewardText,
      stampsRequired: loyaltyPrograms.stampsRequired,
      bonusStamps: loyaltyPrograms.bonusStamps,
      cardDesign: loyaltyPrograms.cardDesign,
    })
    .from(enrollments)
    .innerJoin(merchants, eq(merchants.id, enrollments.merchantId))
    .innerJoin(customers, eq(customers.id, enrollments.customerId))
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .where(eq(enrollments.cardSerial, serial));

  if (!row) return null;

  const design = normalizeDesign(row.cardDesign);
  const qrToken = mintCardToken(row.serial);

  /*
   * The save link embeds the card's CURRENT state, so it is built per read rather than stored — a
   * customer who adds the card after earning three stamps gets a pass showing three, not zero.
   * getSaveUrl answers null on any failure, so a wallet outage costs the button, never the card.
   */
  const google = await getWalletProvider().getSaveUrl({
    serial: row.serial,
    programId: row.programId,
    customerName: row.customerName,
    merchantName: row.merchantName,
    programName: row.programName,
    rewardText: row.rewardText,
    currentStamps: row.currentStamps,
    stampsRequired: row.stampsRequired,
    qrToken,
    brandColor: design.brandColor,
    logoUrl: design.logoUrl, // the shop's own mark, when they've set one
    stripUrl: stripUrlFor(row.serial, row.currentStamps),
    details: design.details,
    location: design.location,
  });

  return {
    serial: row.serial,
    qrToken,
    merchantName: row.merchantName,
    programName: row.programName,
    rewardText: row.rewardText,
    currentStamps: row.currentStamps,
    stampsRequired: row.stampsRequired,
    bonusStamps: row.bonusStamps,
    rewardReady: row.currentStamps >= row.stampsRequired,
    brandColor: design.brandColor,
    stampIcon: design.stampIcon,
    wallet: { apple: null, google }, // Apple needs the $99/yr programme — not wired yet
  };
}



/** The stamp strip for a card, as PNG bytes. Public — the serial is the capability, as with getCard. */
export async function getCardStrip(serial: string): Promise<Buffer | null> {
  const [row] = await adminDb
    .select({
      currentStamps: enrollments.currentProgress,
      stampsRequired: loyaltyPrograms.stampsRequired,
      cardDesign: loyaltyPrograms.cardDesign,
    })
    .from(enrollments)
    .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
    .where(eq(enrollments.cardSerial, serial));
  if (!row) return null;

  const design = normalizeDesign(row.cardDesign);
  return renderStampStrip({
    stampsRequired: row.stampsRequired,
    currentStamps: row.currentStamps,
    brandColor: design.brandColor,
    // Undefined when unset or unreachable — the strip falls back to discs rather than failing.
    icon: await loadIcon(design.stampImageUrl),
  });
}
