import { z } from "zod";

// zod schemas are the single source of truth for request/response shapes.
// The API validates with them; every frontend infers its types from them.
// (No tRPC — end-to-end types come from sharing these schemas + a typed fetch client.)

// An optional staff token (minted by POST /staff/verify-pin) attributes a scan/stamp/redeem to a
// cashier on a shared scanner. Absent when the scanner runs Clerk-login-only.
const staffToken = z.string().optional();

export const StampRequest = z.object({
  enrollmentId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200),
  locationId: z.string().uuid().optional(),
  staffToken,
});
export type StampRequest = z.infer<typeof StampRequest>;

export const RedeemRequest = z.object({
  enrollmentId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200),
  staffToken,
});
export type RedeemRequest = z.infer<typeof RedeemRequest>;

export const ScanRequest = z.object({
  serial: z.string().min(8).max(200), // the customer card serial from the scanned QR
  idempotencyKey: z.string().min(8).max(200),
  staffToken,
});
export type ScanRequest = z.infer<typeof ScanRequest>;

// Cashier PIN → staff token (on a Clerk-authed scanner device).
export const VerifyPinRequest = z.object({
  pin: z.string().min(4).max(12),
});
export type VerifyPinRequest = z.infer<typeof VerifyPinRequest>;

export const ProgramUpdate = z.object({
  name: z.string().min(1).max(60).optional(),
  rewardText: z.string().min(1).max(60).optional(),
  stampsRequired: z.number().int().min(1).max(20).optional(),
  bonusStamps: z.number().int().min(0).max(10).optional(),
  cardDesign: z
    .object({
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #RRGGBB hex colour").optional(),
      stampIcon: z.string().min(1).max(8).optional(),
    })
    .optional(),
});
export type ProgramUpdate = z.infer<typeof ProgramUpdate>;

export const EnrollRequest = z.object({
  merchantId: z.string().uuid(), // from the merchant's counter QR (public routing, not auth)
  programId: z.string().uuid(),
  phone: z.string().min(5).max(32).optional(),
  name: z.string().min(1).max(120).optional(),
  consent: z.object({ sms: z.boolean().optional(), whatsapp: z.boolean().optional() }).optional(),
});
export type EnrollRequest = z.infer<typeof EnrollRequest>;

// Marketing waitlist / early-access capture (public, non-tenant).
export const LeadRequest = z.object({
  businessName: z.string().min(1).max(120),
  email: z.string().email().max(200),
  city: z.string().max(80).optional(),
  message: z.string().max(500).optional(),
});
export type LeadRequest = z.infer<typeof LeadRequest>;

// Merchant onboarding — first Clerk login creates a merchant + a default program.
export const OnboardingRequest = z.object({
  businessName: z.string().min(1).max(120).optional(),
});
export type OnboardingRequest = z.infer<typeof OnboardingRequest>;

export const ProgramDTO = z.object({
  id: z.string(),
  name: z.string(),
  stampsRequired: z.number().int(),
  rewardText: z.string(),
});
export type ProgramDTO = z.infer<typeof ProgramDTO>;

// ── Customer accounts (the consumer "all my cards" app) ──────────────────────────
// Optional consumer identity via social login. Separate from staff/Clerk auth.

// Sign in with a provider ID token (the API verifies it, then find-or-creates the account).
export const SocialAuthRequest = z.object({
  provider: z.enum(["google", "apple"]),
  idToken: z.string().min(1).max(8192), // a provider JWT (~1-2 KB); cap well above that
  device: z.string().max(120).optional(), // a label for the session (e.g. "iPhone Safari")
});
export type SocialAuthRequest = z.infer<typeof SocialAuthRequest>;

// Rotate / revoke a session by its refresh token.
export const RefreshRequest = z.object({ refreshToken: z.string().min(1).max(512) });
export type RefreshRequest = z.infer<typeof RefreshRequest>;
export const LogoutRequest = RefreshRequest;
export type LogoutRequest = z.infer<typeof LogoutRequest>;

// Fold an anonymous (walk-in) card into the signed-in account, by its serial.
export const ClaimCardRequest = z.object({ serial: z.string().min(8).max(200) });
export type ClaimCardRequest = z.infer<typeof ClaimCardRequest>;
