import { SetMetadata } from "@nestjs/common";

export type RateLimitName =
  | "enroll"
  | "public-read"
  | "leads"
  | "customer-auth"
  | "card-read"
  | "card-image"
  | "strip-preview"
  | "asset-upload";

/**
 * Per client address (an IPv6 /64 counts as one). Generous on purpose: UAE mobile carriers put many
 * customers behind one IP, and so does a café's Wi-Fi, so these stop scripted abuse rather than
 * ration real people. Routes without a @RateLimit are not limited.
 */
export const RATE_LIMITS: Record<RateLimitName, { limit: number; windowMs: number }> = {
  // Each signup writes a customer, a card and a wallet job — the tightest a busy café's Wi-Fi can live with.
  enroll: { limit: 60, windowMs: 10 * 60_000 },
  // The shop preview on the enroll landing.
  "public-read": { limit: 120, windowMs: 60_000 },
  // The marketing waitlist: nobody signs up more than a handful of times.
  leads: { limit: 5, windowMs: 10 * 60_000 },
  // Google sign-in, token refresh and logout.
  "customer-auth": { limit: 60, windowMs: 10 * 60_000 },
  // An open card polls every 4s (15/min), so this allows 40 open cards behind one address.
  "card-read": { limit: 600, windowMs: 60_000 },
  // Strips and uploaded artwork. Google fetches these from many addresses, so it never gets near this.
  "card-image": { limit: 600, windowMs: 60_000 },
  // The designer re-renders on each edit, debounced.
  "strip-preview": { limit: 120, windowMs: 60_000 },
  "asset-upload": { limit: 30, windowMs: 10 * 60_000 },
};

export const RATE_LIMIT_KEY = "rateLimit";

/** Limit a route (or every route of a controller) under one of the named budgets above. */
export const RateLimit = (name: RateLimitName) => SetMetadata(RATE_LIMIT_KEY, name);
