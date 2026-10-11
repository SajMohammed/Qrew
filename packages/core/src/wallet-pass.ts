import { createHash } from "node:crypto";
import { stripUrlFor, type PassContent, type PassUpdate } from "@qrew/wallet-core";
import { cardTypeModule, isCardType } from "./card-types";
import { normalizeDesign, type CardDesign } from "./design";

/*
 * What a card's wallet pass shows, built in one place. The card page (for the save link), the
 * wallet worker (creating and updating passes) and the resync script all build from these, so a
 * pass can't show one thing when created and another when updated.
 *
 * Pure: no database, no network.
 */

/** Everything a card's pass is built from — its enrollment, programme, shop and holder. */
export interface PassSource {
  serial: string;
  programId: string;
  customerName: string | null;
  merchantName: string;
  programName: string;
  rewardText: string;
  currentProgress: number;
  stampsRequired: number;
  type: string;
  mechanics: unknown;
  cardDesign: unknown;
}

/** What a programme's template (and so every one of its passes) is built from. */
export interface ProgramSource {
  id: string;
  name: string;
  rewardText: string;
  stampsRequired: number;
  type: string;
  mechanics: unknown;
  cardDesign: unknown;
}

function moduleFor(type: string) {
  return cardTypeModule(isCardType(type) ? type : "stamp");
}

/**
 * Whether this product gets a Google pass today. Only loyalty-mapped ones do: a discount maps to a
 * Google OFFER, with no adapter yet, and issuing it as a loyalty pass would put a counter on a card
 * with nothing to count — and an object can't move between class types later.
 */
export function isWalletIssuable(type: string): boolean {
  return moduleFor(type).wallet.google === "loyalty";
}

/**
 * A short hash of everything that changes how the stamp strip is drawn. It rides in the strip URL:
 * Google caches images by URL, so new artwork at the same count needs a new URL to be seen at all.
 */
export function stripVersion(design: CardDesign, stampsRequired: number): string {
  const drawn = [
    design.brandColor,
    design.stampImageUrl ?? "",
    design.emptyStampImageUrl ?? "",
    design.customStripUrl ?? "",
    design.stampLayout ?? "",
    design.stampScale ?? "",
    design.stampGapX ?? "",
    design.stampGapY ?? "",
    design.unearnedOpacity ?? "",
    stampsRequired,
  ];
  return createHash("sha1").update(JSON.stringify(drawn)).digest("hex").slice(0, 8);
}

/** The strip URL for this card — only for a product drawn as stamps (a balance renders natively). */
function stripFor(src: PassSource, design: CardDesign): string | undefined {
  return moduleFor(src.type).drawsStampStrip
    ? stripUrlFor(src.serial, src.currentProgress, stripVersion(design, src.stampsRequired))
    : undefined;
}

/** What the balance is called on the pass — "Stamps", or the shop's own word for points. */
function pointsLabel(type: string, mechanics: unknown): string {
  const card = moduleFor(type);
  return card.unitLabel(card.normalize(mechanics) as never);
}

/** The whole pass, for creating it or for a save link. */
export function passContentFor(src: PassSource, qrToken: string): PassContent {
  const design = normalizeDesign(src.cardDesign);
  return {
    serial: src.serial,
    programId: src.programId,
    customerName: src.customerName,
    merchantName: src.merchantName,
    programName: src.programName,
    rewardText: src.rewardText,
    currentStamps: src.currentProgress,
    stampsRequired: src.stampsRequired,
    qrToken,
    brandColor: design.brandColor,
    logoUrl: design.logoUrl, // the shop's own mark, when they've set one
    stripUrl: stripFor(src, design),
    pointsLabel: pointsLabel(src.type, src.mechanics),
    details: design.details,
    location: design.location,
  };
}

/** What changes on an existing pass: the count, and everything every pass of the programme shows. */
export function passUpdateFor(src: PassSource): PassUpdate {
  return {
    serial: src.serial,
    // Re-points a pass issued against an older template at its programme's class.
    programId: src.programId,
    currentStamps: src.currentProgress,
    stampsRequired: src.stampsRequired,
    rewardText: src.rewardText,
    pointsLabel: pointsLabel(src.type, src.mechanics),
    stripUrl: stripFor(src, normalizeDesign(src.cardDesign)),
  };
}

/** The programme's template: the shop's name and design, with no card in particular. */
export function templateContentFor(program: ProgramSource, merchantName: string): PassContent {
  const design = normalizeDesign(program.cardDesign);
  return {
    serial: "",
    programId: program.id,
    merchantName,
    programName: program.name,
    rewardText: program.rewardText,
    currentStamps: 0,
    stampsRequired: program.stampsRequired,
    qrToken: "",
    brandColor: design.brandColor,
    logoUrl: design.logoUrl,
    pointsLabel: pointsLabel(program.type, program.mechanics),
    details: design.details,
    location: design.location,
  };
}

/**
 * A fingerprint of what EVERY pass of the programme shows on its own object — the reward row, the
 * balance's label, and (for stamp cards) the strip. When a design save leaves it unchanged, only the
 * template needs pushing: a name or colour change on a points card is one call, not one per pass.
 * A stamp card's colour does change it, rightly — the strip is redrawn in the new colour.
 */
export function passFingerprint(program: Omit<ProgramSource, "id" | "name">): string {
  const strip = moduleFor(program.type).drawsStampStrip
    ? stripVersion(normalizeDesign(program.cardDesign), program.stampsRequired)
    : null;
  const shown = [program.rewardText, pointsLabel(program.type, program.mechanics), strip];
  return createHash("sha1").update(JSON.stringify(shown)).digest("hex").slice(0, 16);
}
