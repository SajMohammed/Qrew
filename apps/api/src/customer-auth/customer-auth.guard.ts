import {
  Injectable,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { verifyCustomerToken } from "@qrew/core";
import type {} from "../auth/request-context"; // Express.Request augmentation (customerAccountId)

/**
 * Route-scoped guard for consumer endpoints (@UseGuards on /me/*). Combined with @Public() so the
 * global ClerkAuthGuard steps aside — customer auth is a SEPARATE system. Verifies the Bearer access
 * token (minted by /auth/social) → sets req.customerAccountId.
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.header("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!bearer) throw new UnauthorizedException("missing bearer token");
    const accountId = verifyCustomerToken(bearer);
    if (!accountId) throw new UnauthorizedException("invalid or expired token");
    req.customerAccountId = accountId;
    return true;
  }
}

/** Inject the customer account id set by CustomerAuthGuard. */
export const CustomerAccount = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.customerAccountId) throw new Error("no customer account — CustomerAuthGuard misconfigured");
  return req.customerAccountId;
});
