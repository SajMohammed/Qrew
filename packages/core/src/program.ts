import { asc, eq } from "drizzle-orm";
import { withTenant, loyaltyPrograms } from "@qrew/db";

export interface CardDesign {
  brandColor: string; // hex, e.g. "#0E6B62"
  stampIcon: string; // emoji, e.g. "☕"
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

export const DEFAULT_DESIGN: CardDesign = { brandColor: "#0E6B62", stampIcon: "☕" };

export function normalizeDesign(raw: unknown): CardDesign {
  const d = (raw ?? {}) as Partial<CardDesign>;
  return {
    brandColor: typeof d.brandColor === "string" ? d.brandColor : DEFAULT_DESIGN.brandColor,
    stampIcon: typeof d.stampIcon === "string" ? d.stampIcon : DEFAULT_DESIGN.stampIcon,
  };
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

    return updated ? toView(updated) : null;
  });
}
