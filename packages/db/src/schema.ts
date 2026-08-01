import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
  customType,
} from "drizzle-orm/pg-core";

/**
 * Qrew schema. Two shapes of data:
 *   • STATE (small, mutable, cached): merchants, locations, staff, programs, customers, enrollments
 *   • LEDGER (append-only truth):     loyalty_progress_events, redemptions
 * `enrollments.current_progress` is a cached PROJECTION derived from loyalty_progress_events.
 * Every tenant table carries `merchant_id` and is guarded by RLS (see migrations/0000_init.sql).
 */

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const merchantId = () =>
  uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" });

export const merchants = pgTable("merchants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("beta"),
  createdAt: createdAt(),
});

export const locations = pgTable(
  "locations",
  {
    id: id(),
    merchantId: merchantId(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Asia/Dubai"),
    createdAt: createdAt(),
  },
  (t) => [index("locations_merchant_idx").on(t.merchantId)],
);

export const staff = pgTable(
  "staff",
  {
    id: id(),
    merchantId: merchantId(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    externalAuthId: text("external_auth_id"), // Clerk user id (staff), when auth is wired
    name: text("name").notNull(),
    role: text("role").notNull().default("cashier"), // owner | manager | cashier
    pinHash: text("pin_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    index("staff_merchant_idx").on(t.merchantId),
    index("staff_external_auth_idx").on(t.externalAuthId), // Clerk userId → staff (auth lookup)
    uniqueIndex("staff_merchant_external_auth_uq")
      .on(t.merchantId, t.externalAuthId)
      .where(sql`${t.externalAuthId} is not null`),
  ],
);

export const loyaltyPrograms = pgTable(
  "loyalty_programs",
  {
    id: id(),
    merchantId: merchantId(),
    name: text("name").notNull(),
    stampsRequired: integer("stamps_required").notNull().default(10),
    bonusStamps: integer("bonus_stamps").notNull().default(2),
    rewardText: text("reward_text").notNull().default("1 free item"),
    cardDesign: jsonb("card_design").notNull().default(sql`'{}'::jsonb`),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("programs_merchant_idx").on(t.merchantId)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    merchantId: merchantId(),
    phone: text("phone"), // PII — stays in-region (me-central-1). Never leaves the UAE.
    name: text("name"),
    email: text("email"), // CRM snapshot of a signed-in customer's account email (set at enroll time)
    consentFlags: jsonb("consent_flags").notNull().default(sql`'{}'::jsonb`), // per-channel TDRA consent
    // links this merchant's customer to the global person (null = anonymous walk-in). See customerAccounts.
    customerAccountId: uuid("customer_account_id").references(() => customerAccounts.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("customers_merchant_idx").on(t.merchantId),
    uniqueIndex("customers_merchant_phone_uq").on(t.merchantId, t.phone),
    index("customers_account_idx").on(t.customerAccountId),
    // one customer row per (merchant, account); anonymous walk-ins (null account) are unaffected
    uniqueIndex("customers_merchant_account_uq")
      .on(t.merchantId, t.customerAccountId)
      .where(sql`${t.customerAccountId} is not null`),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    merchantId: merchantId(),
    programId: uuid("program_id")
      .notNull()
      .references(() => loyaltyPrograms.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    cardSerial: text("card_serial").notNull(),
    currentProgress: integer("current_progress").notNull().default(0), // projection — trigger-maintained (migration 0001)
    applePassId: text("apple_pass_id"),
    googleObjectId: text("google_object_id"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    index("enrollments_merchant_idx").on(t.merchantId),
    uniqueIndex("enrollments_card_serial_uq").on(t.cardSerial),
    // one card per customer per program (blocks the duplicate-enrollment / double-bonus race)
    uniqueIndex("enrollments_customer_program_uq").on(t.customerId, t.programId),
    // the projection can never go negative — backstop behind the redeem FOR UPDATE fix
    check("enrollments_current_progress_nonneg", sql`${t.currentProgress} >= 0`),
  ],
);

/** LEDGER — append-only. One row per stamp earned. Never updated. */
export const loyaltyProgressEvents = pgTable(
  "loyalty_progress_events",
  {
    id: id(),
    merchantId: merchantId(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    delta: integer("delta").notNull().default(1),
    source: text("source").notNull().default("staff_scan"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("loyalty_progress_events_merchant_idx").on(t.merchantId),
    index("loyalty_progress_events_enrollment_idx").on(t.enrollmentId),
    // the analytics dashboard reads this ledger by time within a tenant (stamps per day, period totals)
    index("loyalty_progress_events_merchant_created_idx").on(t.merchantId, t.createdAt),
    // a retried / double-tapped stamp with the same key is a no-op, not a double
    uniqueIndex("loyalty_progress_events_idem_uq").on(t.merchantId, t.idempotencyKey),
  ],
);

/** LEDGER — append-only. One row per reward redeemed. */
export const redemptions = pgTable(
  "redemptions",
  {
    id: id(),
    merchantId: merchantId(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    rewardText: text("reward_text").notNull(),
    stampsSpent: integer("stamps_spent").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("redemptions_merchant_idx").on(t.merchantId),
    // "has this card ever earned a reward?" — the retention ladder joins redemptions per enrollment
    index("redemptions_enrollment_idx").on(t.enrollmentId),
    index("redemptions_merchant_created_idx").on(t.merchantId, t.createdAt),
    uniqueIndex("redemptions_idem_uq").on(t.merchantId, t.idempotencyKey),
  ],
);

/** Postgres `bytea`. Drizzle has no built-in for it; postgres.js hands us a Buffer either way. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Images a shop uploads for their card design — stamp artwork, logo.
 *
 * Tenant-scoped like everything else they own. The public read (Google downloading the image for a
 * wallet pass) goes through the admin connection keyed by the asset's random id: the id IS the
 * capability, exactly as the card serial is. See migration 0009 for why the bytes live here.
 */
export const merchantAssets = pgTable(
  "merchant_assets",
  {
    id: id(),
    merchantId: merchantId(),
    kind: text("kind").notNull(), // 'stamp' | 'logo'
    contentType: text("content_type").notNull().default("image/png"),
    bytes: bytea("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("merchant_assets_merchant_idx").on(t.merchantId)],
);

/**
 * Marketing waitlist / early-access leads. NOT tenant-scoped — a prospective merchant with
 * no account yet, so no `merchant_id`. Written only via the admin connection; RLS with no
 * policy (migration 0002) keeps the app role out entirely.
 */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    businessName: text("business_name").notNull(),
    email: text("email").notNull(),
    city: text("city"),
    message: text("message"),
    source: text("source").notNull().default("marketing"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("leads_email_uq").on(t.email)],
);

/**
 * Customer accounts — OPTIONAL, cross-merchant consumer identity for the "all my cards" app.
 * GLOBAL / admin-path like `leads`: a customer is a person, not a tenant, so no `merchant_id`;
 * written only via the admin connection, RLS-forced with no policy. Staff auth (Clerk) and
 * customer auth (these tables) are separate systems. See migration 0004.
 */
export const customerAccounts = pgTable(
  "customer_accounts",
  {
    id: id(),
    email: text("email"), // canonical; may be null (Apple private relay)
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customer_accounts_email_uq").on(t.email).where(sql`${t.email} is not null`)],
);

/** One social login (Google/Apple) linked to an account. A person can link several. */
export const customerIdentities = pgTable(
  "customer_identities",
  {
    id: id(),
    customerAccountId: uuid("customer_account_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // google | apple
    providerSub: text("provider_sub").notNull(),
    email: text("email"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("customer_identities_provider_sub_uq").on(t.provider, t.providerSub),
    index("customer_identities_account_idx").on(t.customerAccountId),
  ],
);

/** Our own revocable refresh tokens (no per-MAU auth vendor). Store only the hash. */
export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: id(),
    customerAccountId: uuid("customer_account_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    device: text("device"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("customer_sessions_refresh_uq").on(t.refreshTokenHash),
    index("customer_sessions_account_idx").on(t.customerAccountId),
  ],
);

export const schema = {
  merchants,
  locations,
  staff,
  loyaltyPrograms,
  customers,
  enrollments,
  loyaltyProgressEvents,
  redemptions,
  merchantAssets,
  leads,
  customerAccounts,
  customerIdentities,
  customerSessions,
};
