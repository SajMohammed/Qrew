import { Injectable } from "@nestjs/common";
import { verifyToken } from "@clerk/backend";

export interface VerifiedToken {
  userId: string;
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
    const payload = await verifyToken(token, { secretKey });
    return { userId: payload.sub };
  }
}
