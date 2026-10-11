/**
 * The wallet port (ports & adapters). Everything above this interface is vendor-agnostic;
 * only the adapter behind it knows about PassKit / Apple / Google. Swapping "buy" for a
 * native build later touches only an adapter, never the callers.
 *
 * Reality check baked into the shape: a wallet pass is a template — a strip/hero image +
 * a few text fields + a barcode. The rich, animated card is the PWA, not the pass. So
 * `PassContent` carries the modest data a pass can actually show, plus the QR token the
 * staff app scans.
 */

/** Platform identifiers to persist on the enrollment after a pass is issued. */
export interface PassRef {
  serial: string; // our enrollment card_serial — the stable key across platforms
  applePassId?: string;
  googleObjectId?: string;
}

/** The data a pass can display. Kept deliberately small — passes are constrained. */
export interface PassContent {
  serial: string;
  /**
   * The programme's id. The wallet CLASS is keyed on this, never on the programme's name —
   * two shops both calling their card "Loyalty Card" must not collide onto one class, because a
   * class carries the issuer name, colours and logo of whoever created it first.
   */
  programId: string;
  merchantName: string;
  programName: string;
  /** The cardholder. Shown as the member name; omitted for anonymous walk-ins. */
  customerName?: string | null;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  qrToken: string; // encoded into the pass barcode; the staff app scans it to stamp
  /** The card's typeable code, already formatted — shown under the barcode for manual entry. */
  shortCode?: string;
  brandColor?: string; // hex; tempered for legibility per platform guidelines
  logoUrl?: string;
  /**
   * Public URL of the generated stamp strip. Google FETCHES this itself, so it must be reachable
   * from the internet — a localhost URL silently yields no image.
   */
  stripUrl?: string;
  /**
   * What the balance on the pass is called — "Stamps", "Points", the shop's own word. Google shows
   * this beside the number, so calling a points balance "Stamps" would contradict the card.
   */
  pointsLabel?: string;
  /** Extra rows the shop wants on the pass — Google text modules, Apple back fields. */
  details?: { label: string; value: string }[];
  /** Shop location, for the lock-screen "you're nearby" reminder both wallets support. */
  location?: { lat: number; lng: number; label?: string } | null;
  locale?: "en" | "ar";
}

/** What changed on a card after a scan. */
export interface PassUpdate {
  currentStamps: number;
  stampsRequired: number;
  /** The card serial — a wallet barcode is static, so it carries this rather than a token. */
  serial: string;
  /** The card's typeable code, already formatted — shown under the barcode for manual entry. */
  shortCode?: string;
  /**
   * The programme this card belongs to. Supplying it re-points the pass at the correct template,
   * which matters for passes issued before the template was keyed on the programme id.
   */
  programId?: string;
  /** Public URL of the redrawn stamp strip, when this product draws one. */
  stripUrl?: string;
  /** What the balance is called on the pass. */
  pointsLabel?: string;
  /** What the customer is working towards — the one text row the pass keeps. */
  rewardText?: string;
}

/**
 * Where a card's pass stands after an update:
 * - in_wallet — at least one person has it saved;
 * - not_saved — the pass exists (we created it) but nobody has saved it yet;
 * - absent — there is no such pass at all, so the caller should create one.
 */
export type PassSyncOutcome = "in_wallet" | "not_saved" | "absent";

/** A lock-screen notification. The id must be unique per pass — Google rejects a repeat. */
export interface PassMessage {
  id: string;
  header: string;
  body: string;
}

export interface WalletProvider {
  /**
   * A link that adds this card to the customer's wallet, or null when the provider has none.
   * Returns null rather than throwing — the card screen must render with or without a pass.
   */
  getSaveUrl(content: PassContent): Promise<string | null>;
  /**
   * Replace the wallet TEMPLATE (Google calls it a class) with the shop's current design, so editing
   * the card in the console reaches every pass already in a customer's wallet. A full replacement:
   * anything the design no longer has — a removed row, a cleared location — disappears. Throws on
   * failure; the wallet worker that calls it owns the retries.
   */
  syncTemplate(content: PassContent): Promise<void>;
  /**
   * Create the pass if it does not exist yet (idempotent). Called by the wallet worker, never on a
   * request path, so a slow or failing vendor can't hold up a signup.
   */
  issuePass(content: PassContent): Promise<PassRef>;
  /**
   * Update an existing pass after a scan. Takes the whole change, not just a number: the stamp
   * strip is a URL carrying the count, so re-pointing it is part of what "the count changed"
   * means — patch only the number and the pass keeps showing yesterday's stamps.
   *
   * Resolves "absent" when there is no pass to update, so the caller can create one from the card's
   * current state instead of silently dropping the change.
   */
  updateStamps(ref: PassRef, update: PassUpdate): Promise<PassSyncOutcome>;
  /**
   * A lock-screen notification. Google allows only a few per pass per day, so the caller sends one
   * only at a milestone (a reward becoming ready), never on every scan.
   */
  pushUpdate(ref: PassRef, message: PassMessage): Promise<void>;
  /** Void a pass (e.g. on PDPL erasure). */
  revoke(ref: PassRef): Promise<void>;
}
