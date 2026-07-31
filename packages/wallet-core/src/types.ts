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
  brandColor?: string; // hex; tempered for legibility per platform guidelines
  logoUrl?: string;
  /**
   * Public URL of the generated stamp strip. Google FETCHES this itself, so it must be reachable
   * from the internet — a localhost URL silently yields no image.
   */
  stripUrl?: string;
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
  /**
   * The programme this card belongs to. Supplying it re-points the pass at the correct template,
   * which matters for passes issued before the template was keyed on the programme id.
   */
  programId?: string;
  /** Public URL of the redrawn stamp strip, when one is configured. */
  stripUrl?: string;
  /** What the customer is working towards — the one text row the pass keeps. */
  rewardText?: string;
}

export interface WalletProvider {
  /**
   * A link that adds this card to the customer's wallet, or null when the provider has none.
   * Returns null rather than throwing — the card screen must render with or without a pass.
   */
  getSaveUrl(content: PassContent): Promise<string | null>;
  /**
   * Push the shop's current card design onto the wallet TEMPLATE (Google calls it a class), so
   * editing the card in the console is reflected on every pass already in a customer's wallet.
   * Best-effort: the design is saved in our DB regardless.
   */
  syncTemplate(content: PassContent): Promise<void>;
  /** Create a pass for a new enrollment; returns platform ids to persist. */
  issuePass(content: PassContent): Promise<PassRef>;
  /**
   * Update an existing pass after a scan. Takes the whole change, not just a number: the stamp
   * strip is a URL carrying the count, so re-pointing it is part of what "the count changed"
   * means — patch only the number and the pass keeps showing yesterday's stamps.
   */
  updateStamps(ref: PassRef, update: PassUpdate): Promise<void>;
  /** Send a lock-screen push (the changeMessage-style nudge). Rate-limited by the caller. */
  pushUpdate(ref: PassRef, message: string): Promise<void>;
  /** Void a pass (e.g. on PDPL erasure). */
  revoke(ref: PassRef): Promise<void>;
}
