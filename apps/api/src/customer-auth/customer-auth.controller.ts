import { Controller, Post, Body, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { SocialAuthRequest, RefreshRequest, LogoutRequest } from "@qrew/contracts";
import { signInWithProvider, refreshSession, logout } from "@qrew/core";
import { Public } from "../auth/auth.decorators";
import { GoogleTokenVerifier } from "./google-verifier";

/**
 * Consumer sign-in (separate from staff/Clerk). @Public() so the global ClerkAuthGuard steps aside;
 * these routes authenticate with the provider ID token / refresh token instead.
 */
@Controller("auth")
export class CustomerAuthController {
  constructor(private readonly google: GoogleTokenVerifier) {}

  @Public()
  @Post("social")
  async social(@Body() body: unknown) {
    const { provider, idToken, device } = SocialAuthRequest.parse(body);
    if (provider !== "google") throw new BadRequestException("only google sign-in is enabled");
    const identity = await this.google.verify(idToken);
    const tokens = await signInWithProvider(identity, device);
    return this.shape(tokens);
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() body: unknown) {
    const { refreshToken } = RefreshRequest.parse(body);
    const tokens = await refreshSession(refreshToken);
    if (!tokens) throw new UnauthorizedException("invalid or expired refresh token");
    return this.shape(tokens);
  }

  @Public()
  @Post("logout")
  async logout(@Body() body: unknown) {
    const { refreshToken } = LogoutRequest.parse(body);
    await logout(refreshToken);
    return { ok: true };
  }

  // Never leak accountId to the client — the access token is opaque to it.
  private shape(t: { accessToken: string; refreshToken: string; expiresInMs: number }) {
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresInMs: t.expiresInMs };
  }
}
