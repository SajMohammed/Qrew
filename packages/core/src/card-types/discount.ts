import type { CardTypeModule } from "./types";

/**
 * The discount card — a standing entitlement rather than a journey.
 *
 * Nothing accumulates and nothing is redeemed: the customer shows it and gets the discount, today
 * and next week. That makes it the one type the counter's earn-then-redeem flow does not describe,
 * so `accrues` is false and a scan reports the card as valid instead of adding to it.
 *
 * Google issues this as an offer, not a loyalty object — the vertical whose class carries the
 * redemption terms — which on Apple means a coupon.
 */
export interface DiscountMechanics {
  amount: number;
  unit: "percent" | "currency";
  /** ISO code, for a fixed-value discount. */
  currency: string;
  /** The small print, shown on the back of the pass. */
  terms: string;
}

const DEFAULTS: DiscountMechanics = { amount: 10, unit: "percent", currency: "AED", terms: "" };

export const discountCard: CardTypeModule<DiscountMechanics> = {
  type: "discount",
  label: "Discount card",
  blurb: "A standing discount they show at the till. Nothing to collect.",

  normalize: (raw) => {
    const m = (raw ?? {}) as Partial<DiscountMechanics>;
    const unit = m.unit === "currency" ? "currency" : "percent";
    const max = unit === "percent" ? 100 : 100_000;
    return {
      unit,
      amount:
        typeof m.amount === "number" && Number.isFinite(m.amount) && m.amount > 0 && m.amount <= max
          ? m.amount
          : DEFAULTS.amount,
      currency: typeof m.currency === "string" && /^[A-Z]{3}$/.test(m.currency) ? m.currency : DEFAULTS.currency,
      terms: typeof m.terms === "string" ? m.terms.slice(0, 300) : DEFAULTS.terms,
    };
  },

  wallet: { google: "offer", apple: "coupon" },

  accrues: false,

  earn: () => 0,

  acceptsMore: () => false,

  // Not redeemable in the ledger sense: there is no balance to spend down. Using the discount is a
  // till-side event, and inventing a redemption row for it would misreport every other metric.
  redeemable: () => false,

  describe: (_progress, _target, m) =>
    m.unit === "percent" ? `${m.amount}% off` : `${m.currency} ${m.amount} off`,
};
