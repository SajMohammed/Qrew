import { createHmac, timingSafeEqual } from "node:crypto";

// A card's QR encodes a short-lived HMAC-signed token (not the raw serial), so an old
// screenshot of the QR can't be replayed once it expires. The card refreshes it as it polls.
const SECRET = process.env.CARD_TOKEN_SECRET ?? "dev-card-token-secret-change-me";
const DEFAULT_TTL_MS = 120_000; // 2 minutes

/** Mint a short-lived signed token that encodes the card serial. */
export function mintCardToken(serial: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const payload = `${serial}.${Date.now() + ttlMs}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/** Verify a token; return its serial, or null if malformed / tampered / expired. */
export function verifyCardToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64!, "base64url").toString();
  } catch {
    return null;
  }

  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [serial, expStr] = payload.split(".");
  if (!serial || !expStr) return null;
  if (Date.now() > Number(expStr)) return null;
  return serial;
}
