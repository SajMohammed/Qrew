import { Injectable, type CanActivate, type ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ROLES_KEY } from "./auth.decorators";
import type {} from "./request-context";

/** Runs after ClerkAuthGuard. Enforces `@Roles(...)` against the role it put on the request. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.role || !roles.includes(req.role)) throw new ForbiddenException("insufficient role");
    return true;
  }
}
