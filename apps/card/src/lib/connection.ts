import type { FailureKind } from "../api";

/*
 * Whether the card's QR can still be scanned.
 *
 * The QR carries a signed token that lives qrTtlMs (two minutes). The app keeps one token steady
 * while it polls, so the code doesn't change under the cashier's scanner, and takes a fresh one a
 * little before it lapses. With no connection there is no fresh one, and a lapsed code would fail
 * at the till — so it must stop looking scannable.
 *
 * A token's age is measured on this phone's clock, from when it arrived: a phone set to the wrong
 * time still judges it right.
 */

export const POLL_MS = 4000;
/** While the card can't be found: maybe it was deleted, maybe a bad deploy — look again, slowly. */
export const MISSING_POLL_MS = 30_000;
/** Only if an older API leaves qrTtlMs out during a deploy. */
export const DEFAULT_QR_TTL_MS = 120_000;
/** Take a fresh token this long before the held one lapses. */
export const QR_REFRESH_MARGIN_MS = 20_000;
/** Call a code dead this early: it was minted before the answer carrying it arrived. */
export const QR_STALE_MARGIN_MS = 5_000;

export type QrState = "live" | "reconnecting" | "expired";

export function shouldAdoptToken(heldAt: number, ttlMs: number, now: number): boolean {
  return now - heldAt > ttlMs - QR_REFRESH_MARGIN_MS;
}

/** When the held code stops being scannable. */
export function qrExpiresAt(heldAt: number, ttlMs: number): number {
  return heldAt + ttlMs - QR_STALE_MARGIN_MS;
}

export function qrState(i: { heldAt: number; ttlMs: number; failing: FailureKind | null; now: number }): QrState {
  if (i.now > qrExpiresAt(i.heldAt, i.ttlMs)) return "expired";
  return i.failing ? "reconnecting" : "live";
}
