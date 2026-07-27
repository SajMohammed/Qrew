import { createHash, randomBytes } from "node:crypto";
import {
  findOrCreateAccountByIdentity,
  createCustomerSession,
  consumeRefreshSession,
  revokeRefreshSession,
  type VerifiedIdentity,
} from "@qrew/db";
import { mintCustomerToken, CUSTOMER_ACCESS_TTL_MS } from "./token";

// Customer session model (our own — no per-MAU auth vendor):
//   • access token  — short-lived, HMAC-signed (token.ts), subject = account id. Sent as Bearer.
//   • refresh token — random 32 bytes, stored ONLY as a sha256 hash; rotated on every use, revocable.
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInMs: number;
  accountId: string;
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const newRefreshToken = (): string => randomBytes(32).toString("base64url");

async function issueTokens(accountId: string, device?: string): Promise<AuthTokens> {
  const refreshToken = newRefreshToken();
  await createCustomerSession({
    accountId,
    refreshTokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    device,
  });
  return { accessToken: mintCustomerToken(accountId), refreshToken, expiresInMs: CUSTOMER_ACCESS_TTL_MS, accountId };
}

/** Sign in from an already-VERIFIED social identity (the API verifies the provider ID token first). */
export async function signInWithProvider(identity: VerifiedIdentity, device?: string): Promise<AuthTokens> {
  const accountId = await findOrCreateAccountByIdentity(identity);
  return issueTokens(accountId, device);
}

/** Rotate a refresh token: consume the old session (single-use), issue a fresh pair. Null if invalid. */
export async function refreshSession(refreshToken: string, device?: string): Promise<AuthTokens | null> {
  const accountId = await consumeRefreshSession(sha256(refreshToken));
  if (!accountId) return null;
  return issueTokens(accountId, device);
}

/** Revoke a refresh token (logout). Idempotent. */
export async function logout(refreshToken: string): Promise<void> {
  await revokeRefreshSession(sha256(refreshToken));
}
