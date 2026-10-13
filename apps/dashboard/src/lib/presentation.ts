/*
 * One presentation of a card = at most one stamp.
 *
 * The camera decodes about ten frames a second, so a card held up for thirty seconds is three
 * hundred reads of the same value. Sending each with a fresh idempotency key (as the counter used
 * to, re-arming every 1.2 s) let a held card earn a second stamp once the server's cooldown ran out.
 *
 * Instead, every frame of the same value with gaps no longer than PRESENTATION_GAP_MS belongs to
 * one presentation, and a presentation has one key. Its frames never send again — except to retry
 * a request that got no answer, with that same key, so a retry can only ever replay the stamp.
 * The server's (merchant, key) uniqueness is the real guarantee; this is what makes it apply.
 *
 * The value is stable for that long: the customer app holds its QR token for about 100 s, and a
 * wallet pass's barcode is the card's fixed serial.
 */

/** Out of view for longer than this, and the same card shown again is a new presentation. */
export const PRESENTATION_GAP_MS = 3000;
/** How soon a request that got no answer is retried, while the card is still in view. */
export const RETRY_EVERY_MS = 2000;

/** A fresh idempotency key. */
export function newKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Which card a scanned value is, for telling presentations apart. The customer app's QR is a signed
 * token it swaps for a fresh one about every 100 s, so a phone resting in front of the camera would
 * otherwise look like a second card — and earn a second stamp once the cooldown had passed. The
 * token's payload names the card's serial, so two tokens for one card are one card here. Read
 * without verifying: only the server's check counts; this only groups frames. Anything else (a
 * pass's serial, a typed code) is its own identity.
 */
export function cardIdentity(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return value;
  try {
    const payload = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
    const dot = payload.lastIndexOf(".");
    return dot > 0 ? `card:${payload.slice(0, dot)}` : value;
  } catch {
    return value;
  }
}

/** What to send for a frame: the decoded value, and its presentation's key. */
export interface Presentation {
  value: string;
  key: string;
}

export class PresentationTracker {
  private current: { card: string; value: string; key: string; lastSeenAt: number; retryAt: number | null } | null =
    null;

  constructor(
    private readonly makeKey: () => string = () => newKey("scan"),
    private readonly identify: (value: string) => string = cardIdentity,
  ) {}

  /**
   * A decoded frame. Returns what to send, or null to send nothing. `busy` means a request is in
   * flight: a frame of the current card still keeps its presentation alive, so a slow answer
   * doesn't split it in two, but nothing is sent.
   */
  frame(value: string, now: number, busy: boolean): Presentation | null {
    const card = this.identify(value);
    const cur = this.current;
    if (cur && cur.card === card && now - cur.lastSeenAt <= PRESENTATION_GAP_MS) {
      cur.lastSeenAt = now;
      cur.value = value; // a retry sends the freshest token the card has shown
      if (!busy && cur.retryAt !== null && now >= cur.retryAt) {
        cur.retryAt = null;
        return { value, key: cur.key };
      }
      return null;
    }
    if (busy) return null; // another card while one is being stamped — its next frame will do
    this.current = { card, value, key: this.makeKey(), lastSeenAt: now, retryAt: null };
    return { value, key: this.current.key };
  }

  /** The current presentation's request got no answer: retry it, with the same key, if it stays. */
  failed(now: number): void {
    if (this.current) this.current.retryAt = now + RETRY_EVERY_MS;
  }
}
