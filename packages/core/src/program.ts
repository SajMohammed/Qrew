import { and, asc, eq } from "drizzle-orm";
import { withTenant, merchants, loyaltyPrograms } from "@qrew/db";
import { getWalletProvider } from "@qrew/wallet-core";

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
  /** Extra rows shown on the pass (Google text modules / Apple back fields). Max 4. */
  details?: { label: string; value: string }[];
  /** Shop location, for the "you're nearby" lock-screen reminder both wallets support. */
  location?: { lat: number; lng: number; label?: string } | null;
}

export interface ProgramView {
  id: string;
  name: string;
  rewardText: string;
  stampsRequired: number;
  bonusStamps: number;
  active: boolean;
  cardDesign: CardDesign;
}

// Qrew forest green — an un-customized card is on-brand out of the box.
export const DEFAULT_DESIGN: CardDesign = { brandColor: "#146A2E", stampIcon: "☕" };

export function normalizeDesign(raw: unknown): CardDesign {
  const d = (raw ?? {}) as Partial<CardDesign>;
  const details = Array.isArray(d.details)
    ? d.details
        .filter((r): r is { label: string; value: string } => Boolean(r?.label && r?.value))
        .slice(0, 4)
    : undefined;
  return {
    brandColor: typeof d.brandColor === "string" ? d.brandColor : DEFAULT_DESIGN.brandColor,
    stampIcon: typeof d.stampIcon === "string" ? d.stampIcon : DEFAULT_DESIGN.stampIcon,
    // An empty string means "cleared" — store it as absent so adapters fall back cleanly.
    ...(d.logoUrl ? { logoUrl: d.logoUrl } : {}),
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
  return {
    id: p.id,
    name: p.name,
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

    const cardDesign = { ...normalizeDesign(current.cardDesign), ...(patch.cardDesign ?? {}) };
    const [updated] = await db
      .update(loyaltyPrograms)
      .set({
        name: patch.name ?? current.name,
        rewardText: patch.rewardText ?? current.rewardText,
        stampsRequired: patch.stampsRequired ?? current.stampsRequired,
        bonusStamps: patch.bonusStamps ?? current.bonusStamps,
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
