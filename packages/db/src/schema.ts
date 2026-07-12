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
} from "drizzle-orm/pg-core";

/**
 * Qrew schema. Two shapes of data:
 *   • STATE (small, mutable, cached): merchants, locations, staff, programs, customers, enrollments
 *   • LEDGER (append-only truth):     stamp_events, redemptions
 * `enrollments.current_stamps` is a cached PROJECTION derived from stamp_events.
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
  (t) => [index("staff_merchant_idx").on(t.merchantId)],
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
    consentFlags: jsonb("consent_flags").notNull().default(sql`'{}'::jsonb`), // per-channel TDRA consent
    createdAt: createdAt(),
  },
  (t) => [
    index("customers_merchant_idx").on(t.merchantId),
    uniqueIndex("customers_merchant_phone_uq").on(t.merchantId, t.phone),
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
    currentStamps: integer("current_stamps").notNull().default(0), // projection — trigger-maintained (migration 0001)
    applePassId: text("apple_pass_id"),
    googleObjectId: text("google_object_id"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    index("enrollments_merchant_idx").on(t.merchantId),
    uniqueIndex("enrollments_card_serial_uq").on(t.cardSerial),
  ],
);

/** LEDGER — append-only. One row per stamp earned. Never updated. */
export const stampEvents = pgTable(
  "stamp_events",
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
    index("stamp_events_merchant_idx").on(t.merchantId),
    index("stamp_events_enrollment_idx").on(t.enrollmentId),
    // a retried / double-tapped stamp with the same key is a no-op, not a double
    uniqueIndex("stamp_events_idem_uq").on(t.merchantId, t.idempotencyKey),
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
    uniqueIndex("redemptions_idem_uq").on(t.merchantId, t.idempotencyKey),
  ],
);

export const schema = {
  merchants,
  locations,
  staff,
  loyaltyPrograms,
  customers,
  enrollments,
  stampEvents,
  redemptions,
};
