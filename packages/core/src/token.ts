import { createHmac, timingSafeEqual } from "node:crypto";

// A card's QR encodes a short-lived HMAC-signed token (not the raw serial), so an old screenshot
// can't be replayed once it expires. The same primitive mints a shift-long staff token (from a PIN
// check) that attributes a cashier's scans.
const CARD_SECRET = process.env.CARD_TOKEN_SECRET ?? "dev-card-token-secret-change-me";
const STAFF_SECRET = process.env.STAFF_TOKEN_SECRET ?? "dev-staff-token-secret-change-me";
const CARD_TTL_MS = 120_000; // 2 minutes — refreshed as the card polls
const STAFF_TTL_MS = 8 * 60 * 60 * 1000; // one shift

/** A signed, expiring token: base64url(subject.expiry).base64url(hmac). */
function mintSigned(secret: string, subject: string, ttlMs: number): string {
  const payload = `${subject}.${Date.now() + ttlMs}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/** Verify a signed token; return its subject, or null if malformed / tampered / expired. */
function readSigned(secret: string, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64!, "base64url").toString();
  } catch {
    return null;
  }

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [subject, expStr] = payload.split(".");
  if (!subject || !expStr) return null;
  if (Date.now() > Number(expStr)) return null;
  return subject;
}

/** Mint a short-lived signed token that encodes the card serial (the card refreshes it as it polls). */
export function mintCardToken(serial: string, ttlMs: number = CARD_TTL_MS): string {
  return mintSigned(CARD_SECRET, serial, ttlMs);
}

/** Verify a card token; return its serial, or null if malformed / tampered / expired. */
export function verifyCardToken(token: string): string | null {
  return readSigned(CARD_SECRET, token);
}

/** Mint a shift-long token identifying the cashier, minted after a PIN check. */
export function mintStaffToken(staffId: string, ttlMs: number = STAFF_TTL_MS): string {
  return mintSigned(STAFF_SECRET, staffId, ttlMs);
}

/** Verify a staff token; return its staffId, or null if malformed / tampered / expired. */
export function verifyStaffToken(token: string): string | null {
  return readSigned(STAFF_SECRET, token);
}
