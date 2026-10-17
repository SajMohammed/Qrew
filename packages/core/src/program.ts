import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { withTenant, merchants, loyaltyPrograms, enrollments, type TenantDb } from "@qrew/db";
import { cardTypeModule, normalizeMechanics, isCardType, type CardType } from "./card-types";
import { InvalidInputError } from "./errors";
import { DEFAULT_DESIGN, normalizeDesign, type CardDesign } from "./design";
import { isWalletIssuable } from "./wallet-pass";
import { markTemplateSyncRequested, queueTemplateSyncs, walletSyncView, type WalletSyncView } from "./wallet-sync";

export { DEFAULT_DESIGN, normalizeDesign, type CardDesign } from "./design";

/**
 * Whether a card is on. A shop turns card types on and off in Settings; off FREEZES the card rather
 * than removing it: customers keep it and can redeem what it holds, but it takes no new members and
 * no new progress. Turning the type back on unfreezes the same card.
 */
export type ProgramStatus = "active" | "frozen";

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
  status: ProgramStatus;
  /** When this card was last turned on (ISO). */
  enabledAt: string;
  /** When it was last turned off (ISO); null while it is on. */
  frozenAt: string | null;
  cardDesign: CardDesign;
  /** Whether the last design change has reached the passes already in customers' phones. */
  walletSync: WalletSyncView;
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
 * Public pre-enrollment preview of a shop's card — merchant + programme branding, by the routing ids
 * from the counter QR. A frozen card has no preview: it takes no new members. Read via withTenant(merchantId) exactly like enroll; everything returned is
 * public shop branding (name, reward, design), no customer data.
 */
export async function getShopPreview(merchantId: string, programId: string): Promise<ShopPreview | null> {
  return withTenant(merchantId, async (db) => {
    const [merchant] = await db.select({ name: merchants.name }).from(merchants);
    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(and(eq(loyaltyPrograms.id, programId), eq(loyaltyPrograms.status, "active")));
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
    status: p.status === "frozen" ? "frozen" : "active",
    enabledAt: p.enabledAt.toISOString(),
    frozenAt: p.frozenAt?.toISOString() ?? null,
    cardDesign: normalizeDesign(p.cardDesign),
    walletSync: walletSyncView(p),
  };
}

/**
 * Every card the shop has, on or frozen, oldest first — so the shop's original card leads.
 *
 * This is how a page finds the shop's cards. There is no "the" card any more: a shop runs one per
 * type it has turned on, and a screen that wants one names it by id.
 */
export async function listPrograms(merchantId: string): Promise<ProgramView[]> {
  return withTenant(merchantId, async (db) => (await readPrograms(db)).map(toView));
}

function readPrograms(db: TenantDb) {
  return db.select().from(loyaltyPrograms).orderBy(asc(loyaltyPrograms.createdAt), asc(loyaltyPrograms.id));
}

/** One of the merchant's cards, by id. */
export async function getProgram(merchantId: string, programId: string): Promise<ProgramView | null> {
  return withTenant(merchantId, async (db) => {
    const [row] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, programId));
    return row ? toView(row) : null;
  });
}

/**
 * Serialises every change to which cards a shop has: onboarding's first card, turning a type on or
 * off, and a card changing type. Each reads the shop's cards and then writes on what it saw, so two
 * tabs at once could otherwise both turn off "the other" card and leave the shop with none. The
 * prefix keeps this key apart from provisioning's per-user lock (packages/db/src/auth.ts).
 */
async function lockShopCards(db: TenantDb, merchantId: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`shop-cards:${merchantId}`}))`);
}

/**
 * Turn one of the shop's card types on or off, and answer with every card the shop has.
 *
 * On: the type's card is created with that type's defaults the first time, and unfrozen after that,
 * so customers who kept a frozen card carry on with it. Off: the card is frozen. A shop always runs
 * at least one card, so the last one on can't be turned off. Asking for the state a type is already
 * in changes nothing.
 */
export async function setCardTypeEnabled(
  merchantId: string,
  type: CardType,
  enabled: boolean,
): Promise<ProgramView[]> {
  const module = cardTypeModule(type);
  return withTenant(merchantId, async (db) => {
    await lockShopCards(db, merchantId);
    const programs = await readPrograms(db);
    const card = programs.find((p) => p.type === type);

    if (enabled) {
      if (!card) {
        await db.insert(loyaltyPrograms).values({
          merchantId,
          type,
          name: module.label,
          stampsRequired: module.defaultTarget,
          bonusStamps: module.defaultBonus,
          mechanics: module.normalize({}),
          cardDesign: DEFAULT_DESIGN,
        });
      } else if (card.status === "frozen") {
        await db
          .update(loyaltyPrograms)
          .set({ status: "active", enabledAt: sql`now()`, frozenAt: null })
          .where(eq(loyaltyPrograms.id, card.id));
      }
    } else if (card?.status === "active") {
      if (!programs.some((p) => p.id !== card.id && p.status === "active")) {
        throw new InvalidInputError(
          `${module.label} is the only card your shop runs. Turn another card on before turning this one off.`,
        );
      }
      await db
        .update(loyaltyPrograms)
        .set({ status: "frozen", frozenAt: sql`now()` })
        .where(eq(loyaltyPrograms.id, card.id));
    }

    return (await readPrograms(db)).map(toView);
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
    const typeChanged = patch.type !== undefined && patch.type !== current.type;
    if (typeChanged) {
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

      // One card per type: becoming a type the shop already has would make two of it. Locked so a
      // type being turned on in Settings at the same moment can't slip in between.
      await lockShopCards(db, merchantId);
      const [taken] = await db
        .select({ id: loyaltyPrograms.id })
        .from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.type, type), ne(loyaltyPrograms.id, programId)));
      if (taken) {
        throw new InvalidInputError(
          `your shop already has a ${cardTypeModule(type).label.toLowerCase()}, and runs one card of each type. ` +
            `Find it in Settings, under Card types.`,
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
        // A card that becomes another type is that type turned on, now — the date pricing reads.
        ...(typeChanged && current.status === "active" ? { enabledAt: sql`now()` } : {}),
      })
      .where(eq(loyaltyPrograms.id, programId))
      .returning();

    if (!updated) return null;

    // Passes already in customers' phones need the new design. Marked inside this transaction, so
    // the view returned to the owner already reads "pending"; the push itself runs on the worker.
    if (!isWalletIssuable(updated.type)) return toView(updated);
    await markTemplateSyncRequested(db, [updated.id]);
    const [marked] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, updated.id));
    return toView(marked!);
  }).then(async (view) => {
    if (!view || !isWalletIssuable(view.type)) return view;
    /*
     * After the commit, and never waiting on Google: the save is done either way. The worker pushes
     * the template and reports back through the wallet_sync columns, which is how the owner learns
     * whether the passes in customers' phones changed. A push that couldn't even be queued shows as
     * failed now rather than as a "pending" that never resolves.
     */
    const queued = await queueTemplateSyncs(merchantId, [view.id]);
    return queued ? view : { ...view, walletSync: { state: "failed" as const, failedPasses: view.walletSync.failedPasses } };
  });
}

/**
 * Seed a merchant's first loyalty program (idempotent) — used at onboarding after provisioning. A
 * new shop runs a stamp card: stamp is the type that is on by default.
 */
export async function createDefaultProgram(merchantId: string): Promise<ProgramView> {
  return withTenant(merchantId, async (db) => {
    // Two onboarding calls at once (two tabs) both get past provisioning, which is idempotent, and
    // would each seed a programme here. The lock serialises them so the second sees the first's row.
    await lockShopCards(db, merchantId);
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
