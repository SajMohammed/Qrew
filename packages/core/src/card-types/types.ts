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
   * Whether progress accumulates at the counter at all. False for a card that is an entitlement
   * rather than a journey — a discount is valid from the moment it is issued.
   */
  accrues: boolean;

  /** What one scan at the counter is worth, in progress units. */
  earn(mechanics: M): number;

  /** Whether a card holding this much progress can be redeemed. */
  redeemable(progress: number, target: number, mechanics: M): boolean;

  /** How the customer's position reads — "7 of 10", "1,240 points", "20% off". */
  describe(progress: number, target: number, mechanics: M): string;
}
