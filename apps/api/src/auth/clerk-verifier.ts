import { Injectable } from "@nestjs/common";
import { verifyToken } from "@clerk/backend";

export interface VerifiedToken {
  userId: string;
}

/**
 * The origins whose Clerk session tokens are accepted — the same list CORS allows. A session token
 * names the origin it was minted for (its azp claim); without this check, a token from any other
 * site on the same Clerk instance would be accepted here. Unset (development, e2e: same-origin
 * through a proxy) skips the check.
 */
function authorizedParties(env: NodeJS.ProcessEnv = process.env): string[] | undefined {
  const parties = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return parties.length ? parties : undefined;
}

/**
 * Wraps Clerk's stateless JWT verification (signature checked against Clerk's JWKS). Injectable
 * on purpose: tests provide a mock so they never call Clerk — CI has Postgres but no CLERK_SECRET_KEY.
 */
@Injectable()
export class ClerkTokenVerifier {
  async verify(token: string): Promise<VerifiedToken> {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set");
    const parties = authorizedParties();
    const payload = await verifyToken(token, { secretKey, ...(parties ? { authorizedParties: parties } : {}) });
    return { userId: payload.sub };
  }
}
