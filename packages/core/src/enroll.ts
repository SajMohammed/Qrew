import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  withTenant,
  getAccountEmail,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
  loyaltyProgressEvents,
} from "@qrew/db";
import { enqueueWalletSync } from "@qrew/queue";
import { NotFoundError } from "./errors";
import { isWalletIssuable } from "./wallet-pass";

export interface EnrollInput {
  merchantId: string; // from the merchant's (public) counter QR — routing, not auth
  programId: string;
  phone?: string;
  name?: string;
  consent?: { sms?: boolean; whatsapp?: boolean };
  customerAccountId?: string; // present when the consumer is signed in — links the card to "all my cards"
}

/** Draws of a short code before giving up — a clash within one shop is about one in a million. */
const SHORT_CODE_ATTEMPTS = 5;

export interface EnrollResult {
  enrollmentId: string;
  serial: string;
  currentStamps: number;
  alreadyEnrolled: boolean;
}

/**
 * Enroll a customer into a program.
 *
 * - Idempotent per (customer, program): re-scanning returns the existing card and does
 *   NOT re-seed bonus stamps (prevents bonus farming).
 * - Endowed-progress: seeds the program's bonus stamps as a ledger event on signup.
 * - No wallet call: the pass is created by the wallet worker from a queued job, and the card page
 *   hands out a save link built from the card's state either way. A vendor outage used to fail
 *   the signup after the card was already saved — and left that card's pass unsynced for good.
 */
export async function enroll(input: EnrollInput): Promise<EnrollResult> {
  // A signed-in customer's email — read OUTSIDE the tenant tx (the account is global/admin-path) and
  // snapshotted onto the merchant's customer row so the dashboard shows who enrolled, not "Guest".
  const accountEmail = input.customerAccountId ? await getAccountEmail(input.customerAccountId) : null;

  // tx1 — create/find rows, tenant-scoped, no external calls inside the transaction.
  const created = await withTenant(input.merchantId, async (db) => {
    const [merchant] = await db.select({ name: merchants.name }).from(merchants);
    if (!merchant) throw new NotFoundError("merchant not found");

    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(and(eq(loyaltyPrograms.id, input.programId), eq(loyaltyPrograms.active, true)));
    if (!program) throw new NotFoundError("program not found");

    // find-or-create the customer, within the tenant.
    let customer: typeof customers.$inferSelect | undefined;
    if (input.customerAccountId) {
      // Signed-in: identified STRICTLY by account. The phone is NOT a matching key here — it's
      // unverified, so using it would let a caller bind to (read/hijack) a row they don't own via
      // someone else's number. Folding an anonymous card into an account is done separately and
      // securely via claimCardBySerial (possession of the serial is the proof).
      [customer] = await db
        .select()
        .from(customers)
        .where(
          and(eq(customers.merchantId, input.merchantId), eq(customers.customerAccountId, input.customerAccountId)),
        );
      if (customer && !customer.email && accountEmail) {
        // backfill the CRM email onto a row created before it was captured
        [customer] = await db
          .update(customers)
          .set({ email: accountEmail })
          .where(eq(customers.id, customer.id))
          .returning();
      }
      if (!customer) {
        [customer] = await db
          .insert(customers)
          .values({
            merchantId: input.merchantId,
            name: input.name,
            email: accountEmail,
            consentFlags: input.consent ?? {},
            customerAccountId: input.customerAccountId,
            // phone intentionally omitted — a signed-in customer's phone isn't a trust boundary
          })
          .onConflictDoNothing()
          .returning();
        if (!customer) {
          // lost a concurrent enroll for this account — reuse the winner's row
          [customer] = await db
            .select()
            .from(customers)
            .where(
              and(
                eq(customers.merchantId, input.merchantId),
                eq(customers.customerAccountId, input.customerAccountId),
              ),
            );
        }
      }
    } else {
      // Anonymous walk-in: keyed by phone (find-or-create).
      if (input.phone) {
        [customer] = await db
          .select()
          .from(customers)
          .where(and(eq(customers.merchantId, input.merchantId), eq(customers.phone, input.phone)));
      }
      if (!customer) {
        [customer] = await db
          .insert(customers)
          .values({
            merchantId: input.merchantId,
            phone: input.phone,
            name: input.name,
            consentFlags: input.consent ?? {},
          })
          .onConflictDoNothing()
          .returning();
        if (!customer && input.phone) {
          // lost a concurrent enroll for this phone — reuse the winner's row
          [customer] = await db
            .select()
            .from(customers)
            .where(and(eq(customers.merchantId, input.merchantId), eq(customers.phone, input.phone)));
        }
      }
    }

    // idempotent: reuse an existing active enrollment for this customer + program
    const [existing] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.customerId, customer!.id),
          eq(enrollments.programId, program.id),
          eq(enrollments.status, "active"),
        ),
      );
    if (existing) {
      return { alreadyEnrolled: true as const, enrollment: existing, program, merchantName: merchant.name };
    }

    /*
     * ON CONFLICT covers both of the card's unique indexes: a concurrent enroll of this customer
     * into this programme, or — rarely — the short code the database drew being taken in this shop.
     * Only the first leaves a card for this customer behind; a clash simply draws again.
     */
    for (let attempt = 0; attempt < SHORT_CODE_ATTEMPTS; attempt++) {
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          merchantId: input.merchantId,
          programId: program.id,
          customerId: customer!.id,
          cardSerial: randomUUID(),
        })
        .onConflictDoNothing()
        .returning();
      if (enrollment) {
        // endowed-progress bonus — ledger append; the trigger updates current_progress
        if (program.bonusStamps > 0) {
          await db.insert(loyaltyProgressEvents).values({
            merchantId: input.merchantId,
            enrollmentId: enrollment.id,
            delta: program.bonusStamps,
            source: "signup_bonus",
            idempotencyKey: `bonus:${enrollment.id}`,
          });
        }
        return { alreadyEnrolled: false as const, enrollment, program, merchantName: merchant.name };
      }

      // Any status: the one-card-per-customer index doesn't look at it.
      const [raced] = await db
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.customerId, customer!.id), eq(enrollments.programId, program.id)));
      if (raced) {
        // lost a concurrent enroll for this (customer, program) — reuse the winner's card, seed NO bonus
        return { alreadyEnrolled: true as const, enrollment: raced, program, merchantName: merchant.name };
      }
    }
    throw new Error("could not allocate a unique card code");
  });

  const e = created.enrollment;
  if (created.alreadyEnrolled) {
    return { enrollmentId: e.id, serial: e.cardSerial, currentStamps: e.currentProgress, alreadyEnrolled: true };
  }

  // Ask the worker to create the pass, for a product that has one. Best-effort and bounded: the card
  // is committed, and if the job is lost the first stamp's sync creates the pass instead.
  if (isWalletIssuable(created.program.type)) {
    try {
      await enqueueWalletSync({ merchantId: input.merchantId, enrollmentId: e.id, kind: "enroll" });
    } catch (err) {
      console.error("[wallet] enqueue failed (card created; pass will be created on its first sync):", err);
    }
  }

  return {
    enrollmentId: e.id,
    serial: e.cardSerial,
    currentStamps: created.program.bonusStamps,
    alreadyEnrolled: false,
  };
}
