import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { WindowCounter, clientKey } from "@qrew/core";
import { RATE_LIMITS, RATE_LIMIT_KEY, type RateLimitName } from "./rate-limit";

/**
 * Enforces @RateLimit. Registered as the first global guard, so a flood of requests with bad tokens
 * on a limited route is counted before any token is verified.
 *
 * The client address is req.ip, which Express derives from X-Forwarded-For only as far as
 * `trust proxy` (TRUST_PROXY_HOPS) allows — so behind the load balancer it is the customer, and
 * nobody can pick their own bucket by sending the header themselves.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly counters = new Map<RateLimitName, WindowCounter>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const name = this.reflector.getAllAndOverride<RateLimitName | undefined>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!name) return true;

    let counter = this.counters.get(name);
    if (!counter) {
      counter = new WindowCounter(RATE_LIMITS[name].limit, RATE_LIMITS[name].windowMs);
      this.counters.set(name, counter);
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    const { allowed, retryAfterMs } = counter.hit(clientKey(req.ip));
    if (allowed) return true;

    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    ctx.switchToHttp().getResponse<Response>().setHeader("retry-after", String(seconds));
    throw new HttpException(
      {
        statusCode: 429,
        error: "Too Many Requests",
        code: "rate_limited",
        message: `Too many requests — try again in ${seconds}s.`,
        retryAfterSeconds: seconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
