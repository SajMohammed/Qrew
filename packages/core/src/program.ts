import { and, asc, count, eq } from "drizzle-orm";
import { withTenant, merchants, loyaltyPrograms, enrollments } from "@qrew/db";
import { getWalletProvider, type StampLayout } from "@qrew/wallet-core";
import { cardTypeModule, normalizeMechanics, isCardType, type CardType } from "./card-types";
import { InvalidInputError } from "./errors";

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

export interface ProgramView {
  id: string;
  name: string;
  /** What kind of card this is. Fixed once customers hold passes — see updateProgram. */
  type: CardType;
  /** Settings only this card type has, validated by its module. */
  mechanics: unknown;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  active: boolean;
  cardDesign: CardDesign;
}

// Qrew forest green — an un-customized card is on-brand out of the box.
export const DEFAULT_DESIGN: CardDesign = { brandColor: "#146A2E", stampIcon: "☕" };

const LAYOUTS: StampLayout[] = ["row", "grid", "top-heavy", "diamond"];

/** A stored number is only kept when it is a real number in range — a bad one falls back silently. */
function num(v: unknown, lo: number, hi: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
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
  return {
    brandColor: typeof d.brandColor === "string" ? d.brandColor : DEFAULT_DESIGN.brandColor,
    stampIcon: typeof d.stampIcon === "string" ? d.stampIcon : DEFAULT_DESIGN.stampIcon,
    // An empty string means "cleared" — store it as absent so adapters fall back cleanly.
    ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
    ...(d.stampImageUrl ? { stampImageUrl: d.stampImageUrl } : {}),
    ...(d.emptyStampImageUrl ? { emptyStampImageUrl: d.emptyStampImageUrl } : {}),
    ...(d.customStripUrl ? { customStripUrl: d.customStripUrl } : {}),
    ...(d.stampLayout && LAYOUTS.includes(d.stampLayout) ? { stampLayout: d.stampLayout } : {}),
    ...(scale !== undefined ? { stampScale: scale } : {}),
    ...(gapX !== undefined ? { stampGapX: gapX } : {}),
    ...(gapY !== undefined ? { stampGapY: gapY } : {}),
    ...(unearned !== undefined ? { unearnedOpacity: unearned } : {}),
    ...(details && details.length ? { details } : {}),
    ...(d.location ? { location: d.location } : {}),
  };
}

export interface ShopPreview {
  merchantName: string;
  programName: string;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  brandColor: string;
  stampIcon: string;
}

/**
 * Public pre-enrollment preview of a shop's card — merchant + active-program branding, by the routing
 * ids from the counter QR. Read via withTenant(merchantId) exactly like enroll; everything returned is
 * public shop branding (name, reward, design), no customer data.
 */
export async function getShopPreview(merchantId: string, programId: string): Promise<ShopPreview | null> {
  return withTenant(merchantId, async (db) => {
    const [merchant] = await db.select({ name: merchants.name }).from(merchants);
    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(and(eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.active, true)));
    if (!merchant || !program) return null;
    const design = normalizeDesign(program.cardDesign);
    return {
      merchantName: merchant.name,
      programName: program.name,
      rewardText: program.rewardText,
      stampsRequired: program.stampsRequired,
      bonusStamps: program.bonusStamps,
      brandColor: design.brandColor,
      stampIcon: design.stampIcon,
    };
  });
}

function toView(p: typeof loyaltyPrograms.$inferSelect): ProgramView {
  const type = isCardType(p.type) ? p.type : "stamp";
  return {
    id: p.id,
    name: p.name,
    type,
    mechanics: normalizeMechanics(type, p.mechanics),
    rewardText: p.rewardText,
    stampsRequired: p.stampsRequired,
    bonusStamps: p.bonusStamps,
    active: p.active,
    cardDesign: normalizeDesign(p.cardDesign),
  };
}

/** The merchant's program by id, or the oldest active program if id is omitted. */
export async function getProgram(merchantId: string, programId?: string): Promise<ProgramView | null> {
  return withTenant(merchantId, async (db) => {
    const rows = await db
      .select()
      .from(loyaltyPrograms)
      .where(programId ? eq(loyaltyPrograms.id, programId) : eq(loyaltyPrograms.active, true))
      .orderBy(asc(loyaltyPrograms.createdAt))
      .limit(1);
    return rows[0] ? toView(rows[0]) : null;
  });
}

export interface ProgramPatch {
  name?: string;
  type?: CardType;
  mechanics?: unknown;
  rewardText?: string;
  stampsRequired?: number;
  bonusStamps?: number;
  cardDesign?: Partial<CardDesign>;
}

export async function updateProgram(
  merchantId: string,
  programId: string,
  patch: ProgramPatch,
): Promise<ProgramView | null> {
  return withTenant(merchantId, async (db) => {
    const [current] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, programId));
    if (!current) return null;

    /*
     * Changing the card type is only an edit while nobody holds a pass.
     *
     * Google welds an object to its class type, with no conversion endpoint, so a stamp card that
     * becomes a points card needs a new class, new objects, and every customer to save the pass
     * again. Once even one card exists, silently accepting the change would leave those people
     * holding a pass the shop no longer runs. Refuse it here, where the count is known, rather
     * than trusting the UI to hide the control.
     */
    const type = patch.type ?? (isCardType(current.type) ? current.type : "stamp");
    if (patch.type && patch.type !== current.type) {
      const [held] = await db
        .select({ n: count() })
        .from(enrollments)
        .where(eq(enrollments.programId, programId));
      if ((held?.n ?? 0) > 0) {
        throw new InvalidInputError(
          `this programme already has ${held!.n} card${held!.n === 1 ? "" : "s"} in customers' wallets, ` +
            `so its type cannot change. A different card type has to be issued as a new programme.`,
        );
      }
    }

    // Validated against the type being saved, not the one it had — so a type change and its
    // settings can land together.
    const mechanics = normalizeMechanics(type, patch.mechanics ?? (type === current.type ? current.mechanics : {}));
    /*
     * A patch is merged over the current design, so an absent key means "leave it alone" — that is
     * what lets the console send one field. Clearing therefore has to be explicit: an empty string,
     * never an omitted key. Normalising the RESULT keeps those empty strings out of the stored row
     * rather than letting them accumulate in the jsonb.
     */
    const cardDesign = normalizeDesign({
      ...normalizeDesign(current.cardDesign),
      ...(patch.cardDesign ?? {}),
    });
    const [updated] = await db
      .update(loyaltyPrograms)
      .set({
        name: patch.name ?? current.name,
        rewardText: patch.rewardText ?? current.rewardText,
        stampsRequired: Math.min(patch.stampsRequired ?? current.stampsRequired, cardTypeModule(type).maxTarget),
        bonusStamps: patch.bonusStamps ?? current.bonusStamps,
        type,
        mechanics,
        cardDesign,
      })
      .where(eq(loyaltyPrograms.id, programId))
      .returning();

    if (!updated) return null;

    const [merchant] = await db.select({ name: merchants.name }).from(merchants);
    return { view: toView(updated), merchantName: merchant?.name ?? "", updated };
  }).then(async (result) => {
    if (!result) return null;
    const { view, merchantName, updated } = result;

    /*
     * Push the new design onto the wallet template, so a card already sitting in a customer's
     * wallet picks up the shop's new colour, name and logo — that is what makes the card designer
     * mean anything beyond our own app.
     *
     * Best-effort and deliberately after the commit: the design is saved either way, and a wallet
     * outage must not fail the owner's save.
     */
    try {
      const design = normalizeDesign(updated.cardDesign);
      await getWalletProvider().syncTemplate({
        serial: "",
        programId: updated.id,
        merchantName,
        programName: updated.name,
        rewardText: updated.rewardText,
        currentStamps: 0,
        stampsRequired: updated.stampsRequired,
        qrToken: "",
        brandColor: design.brandColor,
        logoUrl: design.logoUrl,
        details: design.details,
        location: design.location,
      });
    } catch (err) {
      console.error("[wallet] could not sync the card design to the wallet template:", err);
    }

    return view;
  });
}

/** Seed a merchant's first loyalty program (idempotent) — used at onboarding after provisioning. */
export async function createDefaultProgram(merchantId: string): Promise<ProgramView> {
  return withTenant(merchantId, async (db) => {
    const [existing] = await db
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.merchantId, merchantId))
      .orderBy(asc(loyaltyPrograms.createdAt))
      .limit(1);
    if (existing) return toView(existing);

    const [created] = await db
      .insert(loyaltyPrograms)
      .values({
        merchantId,
        name: "Loyalty Card",
        stampsRequired: 10,
        bonusStamps: 2,
        rewardText: "1 free item",
        cardDesign: DEFAULT_DESIGN,
      })
      .returning();
    return toView(created!);
  });
}
