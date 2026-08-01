import type { CardTypeModule } from "./types";

/**
 * The membership card — an ongoing status that climbs through tiers.
 *
 * Visits accumulate like a stamp card, but nothing is ever spent: reaching Gold does not consume
 * the progress that got you there, so `redeemable` is false and the balance only ever grows.
 *
 * Issued as a loyalty object, NOT a generic one, despite "generic" being Google's stated home for
 * gym and membership cards. A generic CLASS carries no logo, hero image or background colour at
 * all — branding moves to the object, which would turn one shop rebrand into a write for every
 * customer who holds the card. Loyalty keeps the branding at class level, where a single update
 * reaches every pass.
 */
export interface MembershipTier {
  name: string;
  /** Progress at which this tier starts. The lowest tier should sit at 0. */
  at: number;
}

export interface MembershipMechanics {
  tiers: MembershipTier[];
  /** Months a membership lasts. Zero means it does not expire. */
  expiryMonths: number;
}

const DEFAULTS: MembershipMechanics = {
  tiers: [
    { name: "Member", at: 0 },
    { name: "Silver", at: 10 },
    { name: "Gold", at: 25 },
  ],
  expiryMonths: 12,
};

export const membershipCard: CardTypeModule<MembershipMechanics> = {
  type: "membership",
  label: "Membership card",
  blurb: "An ongoing status that climbs through tiers as they visit.",

  normalize: (raw) => {
    const m = (raw ?? {}) as Partial<MembershipMechanics>;
    const tiers = Array.isArray(m.tiers)
      ? m.tiers
          .filter(
            (t): t is MembershipTier =>
              typeof t?.name === "string" &&
              t.name.trim().length > 0 &&
              typeof t.at === "number" &&
              Number.isFinite(t.at) &&
              t.at >= 0,
          )
          .map((t) => ({ name: t.name.trim().slice(0, 30), at: Math.floor(t.at) }))
          // Sorted so describe() can walk them in order rather than trusting the stored order.
          .sort((a, b) => a.at - b.at)
          .slice(0, 6)
      : [];
    return {
      tiers: tiers.length ? tiers : DEFAULTS.tiers,
      expiryMonths:
        typeof m.expiryMonths === "number" && Number.isFinite(m.expiryMonths) && m.expiryMonths >= 0 && m.expiryMonths <= 120
          ? Math.floor(m.expiryMonths)
          : DEFAULTS.expiryMonths,
    };
  },

  wallet: { google: "loyalty", apple: "storeCard" },

  // Tier thresholds live in mechanics; this only bounds the shared column.
  maxTarget: 1_000_000,

  drawsStampStrip: false,

  accrues: true,

  earn: () => 1,

  acceptsMore: () => true,

  // Status is not spent. Nothing is deducted when a member reaches a tier, so there is nothing to
  // redeem — a redemption row here would misreport the shop's reward metrics.
  redeemable: () => false,

  unitLabel: () => "Visits",

  describe: (progress, _target, m) => {
    const tier = m.tiers.reduce<string>((best, t) => (progress >= t.at ? t.name : best), m.tiers[0]?.name ?? "Member");
    return `${tier} · ${progress.toLocaleString("en-AE")}`;
  },
};
