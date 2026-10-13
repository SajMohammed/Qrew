import { and, asc, count, eq, sql } from "drizzle-orm";
import { withTenant, merchants, loyaltyPrograms, enrollments } from "@qrew/db";
import { cardTypeModule, normalizeMechanics, isCardType, type CardType } from "./card-types";
import { InvalidInputError } from "./errors";
import { DEFAULT_DESIGN, normalizeDesign, type CardDesign } from "./design";
import { isWalletIssuable } from "./wallet-pass";
import { markTemplateSyncRequested, queueTemplateSyncs, walletSyncView, type WalletSyncView } from "./wallet-sync";

export { DEFAULT_DESIGN, normalizeDesign, type CardDesign } from "./design";

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
    walletSync: walletSyncView(p),
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

/** Seed a merchant's first loyalty program (idempotent) — used at onboarding after provisioning. */
export async function createDefaultProgram(merchantId: string): Promise<ProgramView> {
  return withTenant(merchantId, async (db) => {
    // Two onboarding calls at once (two tabs) both get past provisioning, which is idempotent, and
    // would each seed a programme here. The lock serialises them so the second sees the first's row.
    // Not a unique index: a shop may run several programmes. The prefix keeps this key apart from
    // provisioning's per-user lock (packages/db/src/auth.ts).
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`default-program:${merchantId}`}))`);
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
