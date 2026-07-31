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
  merchantName: string;
  programName: string;
  rewardText: string;
  currentStamps: number;
  stampsRequired: number;
  qrToken: string; // encoded into the pass barcode; the staff app scans it to stamp
  brandColor?: string; // hex; tempered for legibility per platform guidelines
  logoUrl?: string;
  locale?: "en" | "ar";
}

export interface WalletProvider {
  /**
   * A link that adds this card to the customer's wallet, or null when the provider has none.
   * Returns null rather than throwing — the card screen must render with or without a pass.
   */
  getSaveUrl(content: PassContent): Promise<string | null>;
  /** Create a pass for a new enrollment; returns platform ids to persist. */
  issuePass(content: PassContent): Promise<PassRef>;
  /** Update the stamp count (and derived visual) on an existing pass. */
  updateStamps(ref: PassRef, currentStamps: number): Promise<void>;
  /** Send a lock-screen push (the changeMessage-style nudge). Rate-limited by the caller. */
  pushUpdate(ref: PassRef, message: string): Promise<void>;
  /** Void a pass (e.g. on PDPL erasure). */
  revoke(ref: PassRef): Promise<void>;
}
