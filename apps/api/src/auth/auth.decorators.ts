import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** Open a route to unauthenticated callers (enroll, card/:serial, leads, health). */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Authenticate the user but skip merchant resolution (for onboarding, before a merchant exists). */
export const ALLOW_NO_MERCHANT_KEY = "allowNoMerchant";
export const AllowNoMerchant = () => SetMetadata(ALLOW_NO_MERCHANT_KEY, true);

/** Restrict a handler to specific staff roles (owner | manager | cashier). */
export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Inject the verified merchant id set by ClerkAuthGuard (replaces the ad-hoc tenant(req) helper). */
export const Merchant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.merchantId) throw new Error("no merchant on request — ClerkAuthGuard misconfigured");
  return req.merchantId;
});
