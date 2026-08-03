import type { CardTypeModule } from "./types";

/**
 * The points card — spend, accumulate a balance, spend the balance on a reward.
 *
 * The one type Google renders natively: `loyaltyPoints` on a loyalty object shows a balance without
 * an image, so a points pass does not depend on the strip the way a stamp card does.
 *
 * Earning is per visit today because the counter records a scan, not a sale — there is nowhere for
 * a cashier to key in what the customer spent. `perCurrency` is honoured the moment an amount
 * arrives, so wiring that later is a change to the till screen and not to this file.
 */
export interface PointsMechanics {
  /** What the shop calls its points — "points", "beans", "stars". */
  unitLabel: string;
  /** Awarded per visit when no spend is recorded. */
  perVisit: number;
  /** Points per unit of currency spent. Zero means the shop rewards visits, not spend. */
  perCurrency: number;
}

const DEFAULTS: PointsMechanics = { unitLabel: "points", perVisit: 10, perCurrency: 0 };

function positive(v: unknown, fallback: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : fallback;
}

export const pointsCard: CardTypeModule<PointsMechanics> = {
  type: "points",
  label: "Points card",
  blurb: "They build up a balance and spend it on a reward.",

  normalize: (raw) => {
    const m = (raw ?? {}) as Partial<PointsMechanics>;
    const label = typeof m.unitLabel === "string" && m.unitLabel.trim() ? m.unitLabel.trim() : DEFAULTS.unitLabel;
    return {
      unitLabel: label.slice(0, 20),
      perVisit: positive(m.perVisit, DEFAULTS.perVisit, 10_000),
      perCurrency: positive(m.perCurrency, DEFAULTS.perCurrency, 1_000),
    };
  },

  wallet: { google: "loyalty", apple: "storeCard" },

  // A balance has no natural ceiling — shops set rewards in the hundreds or thousands.
  maxTarget: 1_000_000,

  defaultTarget: 500,

  drawsStampStrip: false,

  accrues: true,

  earn: (m, ctx) =>
    ctx.amount !== undefined && m.perCurrency > 0 ? Math.floor(ctx.amount * m.perCurrency) : m.perVisit,

  // A balance does not stop at the first reward. Capping it here would quietly strand every
  // customer who earned past the threshold before getting round to redeeming.
  acceptsMore: () => true,

  redeemable: (progress, target) => progress >= target,

  // The shop's own word, capitalised for the pass where it sits as a field label.
  unitLabel: (m) => m.unitLabel.charAt(0).toUpperCase() + m.unitLabel.slice(1),

  describe: (progress, _target, m) => `${progress.toLocaleString("en-AE")} ${m.unitLabel}`,
};
