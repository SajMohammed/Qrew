import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

// Make `req.merchantId` available to handlers.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      merchantId?: string;
    }
  }
}

/**
 * PLACEHOLDER tenant resolution for Phase 1.
 *
 * TODO(auth): derive `merchantId` from the VERIFIED Clerk/session JWT — never trust a
 * client-supplied header in production. This stub reads `x-merchant-id` only so the
 * tenant-scoped data path is demonstrable before auth is wired.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const merchantId = req.header("x-merchant-id");
    if (merchantId) req.merchantId = merchantId;
    next();
  }
}
