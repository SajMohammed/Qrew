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

// Adding someone to the team. Role is deliberately limited to manager|cashier: owners are created
// by onboarding from a verified login, so this endpoint can never be used to mint one.
export const StaffCreate = z.object({
  name: z.string().min(1).max(60),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
  role: z.enum(["manager", "cashier"]).default("cashier"),
});
export type StaffCreate = z.infer<typeof StaffCreate>;

// Reset a counter PIN.
export const StaffPinUpdate = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});
export type StaffPinUpdate = z.infer<typeof StaffPinUpdate>;

export const ProgramUpdate = z.object({
  name: z.string().min(1).max(60).optional(),
  rewardText: z.string().min(1).max(60).optional(),
  stampsRequired: z.number().int().min(1).max(20).optional(),
  bonusStamps: z.number().int().min(0).max(10).optional(),
  /**
   * The shop's design INTENT — never platform field names. Each wallet adapter maps this onto its
   * own template (Google class/object, Apple pass.json), so one design drives the app card, both
   * passes and the printed poster. Everything here is expressible on BOTH platforms.
   */
  cardDesign: z
    .object({
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #RRGGBB hex colour").optional(),
      stampIcon: z.string().min(1).max(8).optional(),
      /** Public https image. Google fetches this URL; Apple bundles the file into the pass. */
      logoUrl: z.string().url().max(500).optional().or(z.literal("")),
      /** Extra rows on the pass — Google textModulesData, Apple back fields. */
      details: z
        .array(z.object({ label: z.string().min(1).max(30), value: z.string().min(1).max(120) }))
        .max(4)
        .optional(),
      /** Drives the "you're nearby" lock-screen reminder on both platforms. */
      location: z
        .object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
          label: z.string().max(60).optional(),
        })
        .nullable()
        .optional(),
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

// Public pre-enrollment card preview — the (routing) ids from the counter QR.
export const PreviewQuery = z.object({ m: z.string().uuid(), p: z.string().uuid() });
export type PreviewQuery = z.infer<typeof PreviewQuery>;

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

// ── Shop analytics / CRM (the owner console) ─────────────────────────────────────
// Query strings arrive as text, so numeric bounds are coerced before they are validated.

// How far back the dashboard looks. A closed set, not free-form days — every window has a
// matching "previous period" the API knows how to compare against.
export const AnalyticsQuery = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;

// The Customers tab: one actionable segment at a time, searchable and paged.
export const CustomersQuery = z.object({
  filter: z.enum(["all", "at_risk", "reward_ready", "regulars"]).default("all"),
  search: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CustomersQuery = z.infer<typeof CustomersQuery>;
