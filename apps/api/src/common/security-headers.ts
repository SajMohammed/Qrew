import type { NextFunction, Request, Response } from "express";

/**
 * Security headers for every response. The API serves only JSON and PNG, so the policy is short
 * and written out here rather than configuring helmet against its own defaults.
 *
 * Cross-Origin-Resource-Policy is "cross-origin" on purpose — helmet's default, same-origin, would
 * stop the card app and the designer (other origins) from showing uploaded artwork and strips.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-frame-options", "DENY");
  // Nothing here is a page: block scripts and framing outright; an image opened directly still shows.
  res.setHeader("content-security-policy", "default-src 'none'; img-src 'self'; frame-ancestors 'none'");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  res.setHeader("strict-transport-security", "max-age=15552000");
  next();
}
