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
  // The scanned QR value (a signed token or a serial), or a short card code typed at the counter.
  serial: z.string().trim().min(6).max(200),
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

/**
 * A saved image link: http(s) only. Any other scheme — data:, javascript:, file: — would reach a
 * server-side fetch or a wallet pass. http stays allowed because development uploads live on
 * http://localhost; the strip's fetch itself only follows https links (see fetchArtwork).
 */
const imageUrl = z.url({ protocol: /^https?$/ }).max(500);

/** The card types a shop can run, one card of each. Keep in step with CARD_TYPES in @qrew/core. */
export const CardType = z.enum(["stamp", "points", "discount", "membership"]);
export type CardType = z.infer<typeof CardType>;

export const ProgramUpdate = z.object({
  name: z.string().min(1).max(60).optional(),
  /**
   * What kind of card this is. The API accepts a change; the domain refuses one on a programme
   * whose passes are already in customers' wallets, because a wallet object cannot move between
   * class types — see packages/core/src/card-types/types.ts.
   */
  type: CardType.optional(),
  /** Settings only the chosen type has. Shape is validated per type in the domain. */
  mechanics: z.record(z.string(), z.unknown()).optional(),
  rewardText: z.string().min(1).max(60).optional(),
  // The real ceiling is per card type and enforced in the domain — a points card is not
  // bounded by what a stamp strip can legibly draw.
  stampsRequired: z.number().int().min(1).max(1_000_000).optional(),
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
      logoUrl: imageUrl.optional().or(z.literal("")),
      /**
       * The shop's stamp artwork — a square transparent PNG, drawn into the wallet stamp strip.
       * PNG specifically: the strip is composited server-side, and JPEG cannot be decoded there.
       */
      stampImageUrl: imageUrl.optional().or(z.literal("")),
      /** Artwork for a stamp not yet earned. Without one, the earned artwork is drawn faded. */
      emptyStampImageUrl: imageUrl.optional().or(z.literal("")),
      /**
       * A finished strip the shop drew themselves, passed through untouched. Costs them the live
       * stamp count — the image cannot change as they earn — so it is opt-in, never the default.
       */
      customStripUrl: imageUrl.optional().or(z.literal("")),
      stampLayout: z.enum(["row", "grid", "top-heavy", "diamond"]).optional(),
      stampScale: z.number().min(0.5).max(1.4).optional(),
      stampGapX: z.number().min(0).max(0.6).optional(),
      stampGapY: z.number().min(0).max(0.6).optional(),
      unearnedOpacity: z.number().min(0.05).max(1).optional(),
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

// Turning a card type on (creating or unfreezing its card) or off (freezing it) — owner-only.
export const CardTypeToggle = z.object({ enabled: z.boolean() });
export type CardTypeToggle = z.infer<typeof CardTypeToggle>;

/**
 * Render a design that has not been saved, so the card designer can show the real strip a wallet
 * will fetch rather than a mock of it. Stamp counts come in because the preview shows a part-filled
 * card; they are display state, not anything this writes.
 */
export const StripPreviewRequest = z.object({
  /**
   * Only what the strip uses, and lenient on purpose: the designer previews on every keystroke, so
   * a half-typed link must not 400 the preview. The domain drops what it cannot use.
   */
  cardDesign: z.object({
    brandColor: z.string().max(32).optional(),
    stampImageUrl: z.string().max(500).optional(),
    emptyStampImageUrl: z.string().max(500).optional(),
    customStripUrl: z.string().max(500).optional(),
    stampLayout: z.string().max(20).optional(),
    stampScale: z.number().optional(),
    stampGapX: z.number().optional(),
    stampGapY: z.number().optional(),
    unearnedOpacity: z.number().optional(),
  }),
  stampsRequired: z.number().int().min(1).max(20),
  currentStamps: z.number().int().min(0).max(20),
  platform: z.enum(["google", "apple"]).default("google"),
});
export type StripPreviewRequest = z.infer<typeof StripPreviewRequest>;

// Uploading a design image. The file itself is the raw request body; this is the query string.
export const AssetUploadQuery = z.object({
  kind: z.enum(["stamp", "logo"]),
});
export type AssetUploadQuery = z.infer<typeof AssetUploadQuery>;

export const EnrollRequest = z.object({
  merchantId: z.string().uuid(), // from the merchant's counter QR (public routing, not auth)
  programId: z.string().uuid(),
  // No phone: an unverified number is not identity. Matching on one would hand anyone who typed a
  // customer's number that customer's card serial — a bearer credential for their card.
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

/**
 * A shop's name. Customers see it on their card, the sign-up page, the Google Wallet pass (as the
 * issuer) and the printed counter poster, so: trimmed, short enough for a pass header (40), and one
 * clean line. Control characters would break those single-line layouts; bidi overrides (U+202A-E,
 * U+2066-9) could make it render reversed or spoof another shop's. Any script is fine, and the zero-
 * width joiners Arabic and Persian names use are not refused.
 */
export const ShopName = z
  .string()
  .trim()
  .min(2, "Shop name must be at least 2 characters")
  .max(40, "Shop name must be 40 characters or fewer")
  .regex(/^[^\p{Cc}\u202A-\u202E\u2066-\u2069]+$/u, "Shop name can't contain line breaks or control characters");

// Merchant onboarding — the owner names their shop on first sign-in, before anything is provisioned.
export const OnboardingRequest = z.object({
  businessName: ShopName,
});
export type OnboardingRequest = z.infer<typeof OnboardingRequest>;

// Renaming the shop — owner-only (PATCH /merchant).
export const MerchantUpdate = z.object({ name: ShopName });
export type MerchantUpdate = z.infer<typeof MerchantUpdate>;

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
  // One of the shop's cards; absent means the whole shop.
  program: z.string().uuid().optional(),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;

// The Customers tab: one actionable segment at a time, searchable and paged.
export const CustomersQuery = z.object({
  filter: z.enum(["all", "at_risk", "reward_ready", "regulars"]).default("all"),
  // One of the shop's cards: only its holders. Absent means everyone.
  program: z.string().uuid().optional(),
  search: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CustomersQuery = z.infer<typeof CustomersQuery>;
