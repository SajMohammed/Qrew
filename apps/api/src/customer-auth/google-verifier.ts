import { Injectable, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";
import type { VerifiedIdentity } from "@qrew/db";

/**
 * Verifies a Google ID token → a customer identity. Injectable + mockable, like ClerkTokenVerifier:
 * the real path checks the token's signature against Google's JWKS and its `aud` against our client
 * id (google-auth-library caches the keys). A DEV bypass (NODE_ENV=development + AUTH_DEV_BYPASS) also
 * accepts a `dev.<sub>.<email>` token so the whole account flow is testable before a real client id
 * exists — off and unreachable in production.
 */
@Injectable()
export class GoogleTokenVerifier {
  private client = new OAuth2Client();

  async verify(idToken: string): Promise<VerifiedIdentity> {
    if (this.devBypass() && idToken.startsWith("dev.")) {
      // dev.<sub>.<email> — split on the FIRST dot only, since the email itself contains dots.
      const rest = idToken.slice(4);
      const dot = rest.indexOf(".");
      const sub = dot === -1 ? rest : rest.slice(0, dot);
      const email = dot === -1 ? undefined : rest.slice(dot + 1) || undefined;
      if (!sub) throw new UnauthorizedException("dev token must be dev.<sub>.<email>");
      return { provider: "google", sub, email, emailVerified: true };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new UnauthorizedException("GOOGLE_CLIENT_ID is not set");

    let payload: import("google-auth-library").TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException("invalid Google token");
    }
    if (!payload?.sub) throw new UnauthorizedException("invalid Google token");
    return {
      provider: "google",
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
    };
  }

  private devBypass(): boolean {
    return process.env.NODE_ENV === "development" && process.env.AUTH_DEV_BYPASS === "true";
  }
}
