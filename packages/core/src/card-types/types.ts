/**
 * What kinds of card a shop can run.
 *
 * IMMUTABLE ONCE ISSUED. Google welds an object to its class type — every object's `classId` "must
 * be of the same type as this object", and there is no conversion endpoint. Apple does not document
 * changing a pass style on update either. So switching a live programme from stamps to points is
 * not an edit; it means a new class, new objects, and every customer re-saving their pass. The
 * domain enforces this rather than leaving it to the UI, because the consequence lands on people
 * who already have the card in their phone.
 */
export const CARD_TYPES = ["stamp", "points", "discount", "membership"] as const;
export type CardType = (typeof CARD_TYPES)[number];

/**
 * Which wallet template a type is issued against.
 *
 * Not a free choice — it follows from what each platform can render. Only Google's loyalty object
 * has a native points balance; only Apple's storeCard and coupon have a strip image, which is the
 * only way to draw stamps at all.
 */
/** What the counter knew at the moment of the scan. */
export interface EarnContext {
  /**
   * What the customer spent. The counter does not capture an amount today, so this is always
   * absent — a points card falls back to its per-visit rate until it does.
   */
  amount?: number;
}

export interface WalletMapping {
  google: "loyalty" | "offer" | "generic";
  apple: "storeCard" | "coupon" | "generic";
}

/**
 * Everything that differs between one kind of card and another, in one object.
 *
 * Adding a fifth product should be this file's shape filled in once and registered — not a new
 * branch in scan, redeem, the wallet adapter and the designer.
 *
 * Note what is NOT here: the designer's controls. Those are React components and live with the
 * dashboard that renders them. Describing form controls in the domain would mean inventing a
 * serialisable control language, and the domain would then own how a UI it never sees looks.
 */
export interface CardTypeModule<M = unknown> {
  type: CardType;
  /** Shown in the card designer's type picker. */
  label: string;
  /** One line, in the shop's language, about what their customer gets. */
  blurb: string;

  /**
   * Take whatever is stored in the programme's `mechanics` jsonb and return settings this type can
   * actually use, filling in defaults.
   *
   * Hand-written rather than a schema object, matching normalizeDesign: the domain validates by
   * shape-checking what it reads, and the zod dependency stays at the API boundary where requests
   * arrive. Must never throw — a row that has drifted falls back to defaults rather than taking
   * the shop's card offline.
   */
  normalize(raw: unknown): M;

  wallet: WalletMapping;

  /**
   * The largest reward threshold this type makes sense with.
   *
   * A stamp card is bounded by what a strip can legibly draw; a points card is not bounded by
   * anything like it, and capping both at the same number would make a points reward of 500
   * impossible to configure. Enforced in the domain so a direct API call cannot set a stamp card
   * to a target the strip would silently clamp away.
   */
  maxTarget: number;

  /**
   * A sensible reward threshold when a shop first picks this type.
   *
   * Carrying the previous type's number over is worse than a guess: a stamp card's 10 becomes a
   * points card where a single visit earns the reward.
   */
  defaultTarget: number;

  /**
   * Whether the pass shows progress as a picture of stamps.
   *
   * Only a stamp card does. Google renders a points balance natively and a discount has no
   * progress at all, so sending either a strip would put a row of stamps on a card that does not
   * work that way — and the customer would read it as one that does.
   */
  drawsStampStrip: boolean;

  /**
   * Whether progress accumulates at the counter at all. False for a card that is an entitlement
   * rather than a journey — a discount is valid from the moment it is issued.
   */
  accrues: boolean;

  /** What one scan at the counter is worth, in progress units. */
  earn(mechanics: M, ctx: EarnContext): number;

  /**
   * Whether the card should keep taking progress.
   *
   * NOT the same question as `redeemable`, though a stamp card answers them from the same number.
   * A full stamp card stops until the customer redeems; a points balance keeps climbing past the
   * reward threshold and always has. Conflating the two would silently cap every points card at
   * its first reward.
   */
  acceptsMore(progress: number, target: number, mechanics: M): boolean;

  /** Whether a card holding this much progress can be redeemed. */
  redeemable(progress: number, target: number, mechanics: M): boolean;

  /**
   * What the running total is called on a wallet pass — "Stamps", "Beans", "Visits".
   *
   * Google prints this beside the number, so it has to be the product's own word: a points balance
   * labelled "Stamps" contradicts the card it sits on.
   */
  unitLabel(mechanics: M): string;

  /** How the customer's position reads — "7 of 10", "1,240 points", "20% off". */
  describe(progress: number, target: number, mechanics: M): string;
}
