import type { CardTypeModule } from "./types";

/**
 * The stamp card — buy nine coffees, get the tenth free.
 *
 * This module is deliberately a description of what the code already did, not a redesign of it. If
 * the existing suite passes with scan, redeem and enroll going through here, the abstraction fits;
 * if it needed a special case to keep them passing, it does not, and the shape is wrong before
 * three more products are written against it.
 *
 * Empty mechanics is the honest answer for stamps, not an oversight: how many stamps earn a reward
 * and what head start a signup gives are `stamps_required` and `bonus_stamps`, columns every
 * progress-based type shares. Nothing else is stamp-specific. (The anti-double-tap cooldown is
 * deployment-wide config, not a per-shop setting.)
 */
type StampMechanics = Record<string, never>;

export const stampCard: CardTypeModule<StampMechanics> = {
  type: "stamp",
  label: "Stamp card",
  blurb: "A stamp per visit. When the card is full, they get the reward.",

  normalize: () => ({}),

  // A stamp card shows its stamps as a picture, and a strip image is the only way either wallet
  // can draw one — which on Apple means storeCard or coupon, never generic.
  wallet: { google: "loyalty", apple: "storeCard" },

  // The strip renderer draws at most 20, and twenty stamps is already a long card.
  maxTarget: 20,

  defaultTarget: 10,

  drawsStampStrip: true,

  accrues: true,

  earn: () => 1,

  // A full card stops until the reward is taken — that is what makes it a card rather than a tally.
  acceptsMore: (progress, target) => progress < target,

  redeemable: (progress, target) => progress >= target,

  unitLabel: () => "Stamps",

  describe: (progress, target) => `${progress} of ${target}`,
};
