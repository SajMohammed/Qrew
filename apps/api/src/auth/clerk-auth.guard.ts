import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { resolveStaffByClerkUser } from "@qrew/db";
import { ClerkTokenVerifier } from "./clerk-verifier";
import { IS_PUBLIC_KEY, ALLOW_NO_MERCHANT_KEY } from "./auth.decorators";
import type {} from "./request-context"; // pull in the Express.Request augmentation

function devBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.AUTH_DEV_BYPASS === "true";
}

/**
 * Closed-by-default authentication. Verifies the Bearer JWT → Clerk userId, resolves the user's
 * staff row(s) → merchant + role (via adminDb, since this runs before app.merchant_id is set), and
 * populates req. `@Public()` opts a route out; `@AllowNoMerchant()` authenticates without resolving
 * a merchant (onboarding). A DEV-only bypass accepts x-merchant-id when there's no token, so local
 * dev and CI keep working before the frontend sends Clerk tokens.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: ClerkTokenVerifier,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (this.meta(ctx, IS_PUBLIC_KEY)) return true;

    const header = req.header("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!bearer && devBypassEnabled()) {
      const merchantId = req.header("x-merchant-id");
      if (!merchantId) throw new UnauthorizedException("dev bypass: x-merchant-id required");
      req.merchantId = merchantId;
      req.role = "owner";
      return true;
    }

    if (!bearer) throw new UnauthorizedException("missing bearer token");
    let userId: string;
    try {
      ({ userId } = await this.verifier.verify(bearer));
    } catch {
      throw new UnauthorizedException("invalid or expired token");
    }
    req.auth = { userId };

    if (this.meta(ctx, ALLOW_NO_MERCHANT_KEY)) return true;

    const rows = await resolveStaffByClerkUser(userId);
    if (rows.length === 0) throw new ConflictException({ code: "needs_onboarding" });
    if (rows.length === 1) {
      req.merchantId = rows[0]!.merchantId;
      req.role = rows[0]!.role;
      return true;
    }

    // Multiple merchants: the client names one, and we confirm it's actually theirs (can't be spoofed).
    const requested = req.header("x-active-merchant");
    const match = rows.find((r) => r.merchantId === requested);
    if (!match) throw new BadRequestException("multiple merchants — set a valid x-active-merchant header");
    req.merchantId = match.merchantId;
    req.role = match.role;
    return true;
  }

  private meta(ctx: ExecutionContext, key: string): boolean {
    return Boolean(this.reflector.getAllAndOverride<boolean>(key, [ctx.getHandler(), ctx.getClass()]));
  }
}
