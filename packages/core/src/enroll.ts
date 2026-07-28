import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  withTenant,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
  stampEvents,
} from "@qrew/db";
import { getWalletProvider } from "@qrew/wallet-core";

export interface EnrollInput {
  merchantId: string; // from the merchant's (public) counter QR — routing, not auth
  programId: string;
  phone?: string;
  name?: string;
  consent?: { sms?: boolean; whatsapp?: boolean };
  customerAccountId?: string; // present when the consumer is signed in — links the card to "all my cards"
}

export interface EnrollResult {
  enrollmentId: string;
  serial: string;
  currentStamps: number;
  applePassId?: string;
  googleObjectId?: string;
  alreadyEnrolled: boolean;
}

/**
 * Enroll a customer into a program and issue their wallet pass.
 *
 * - Idempotent per (customer, program): re-scanning returns the existing card and does
 *   NOT re-seed bonus stamps (prevents bonus farming).
 * - Endowed-progress: seeds the program's bonus stamps as a ledger event on signup.
 * - The external pass-issuing call happens OUTSIDE the DB transaction (never hold a
 *   transaction open across the network).
 */
export async function enroll(input: EnrollInput): Promise<EnrollResult> {
  const provider = getWalletProvider();

  // tx1 — create/find rows, tenant-scoped, no external calls inside the transaction.
  const created = await withTenant(input.merchantId, async (db) => {
    const [merchant] = await db.select({ name: merchants.name }).from(merchants);
    if (!merchant) throw new Error("merchant not found");

    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(and(eq(loyaltyPrograms.id, input.programId), eq(loyaltyPrograms.active, true)));
    if (!program) throw new Error("program not found");

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
      if (!customer) {
        [customer] = await db
          .insert(customers)
          .values({
            merchantId: input.merchantId,
            name: input.name,
            consentFlags: input.consent ?? {},
            customerAccountId: input.customerAccountId,
            // phone intentionally omitted — a signed-in customer's phone isn't a trust boundary
          })
          .returning();
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
          .returning();
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

    const serial = randomUUID();
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        merchantId: input.merchantId,
        programId: program.id,
        customerId: customer!.id,
        cardSerial: serial,
      })
      .returning();

    // endowed-progress bonus — ledger append; the trigger updates current_stamps
    if (program.bonusStamps > 0) {
      await db.insert(stampEvents).values({
        merchantId: input.merchantId,
        enrollmentId: enrollment!.id,
        delta: program.bonusStamps,
        source: "signup_bonus",
        idempotencyKey: `bonus:${enrollment!.id}`,
      });
    }
    return { alreadyEnrolled: false as const, enrollment: enrollment!, program, merchantName: merchant.name };
  });

  const e = created.enrollment;
  if (created.alreadyEnrolled) {
    return {
      enrollmentId: e.id,
      serial: e.cardSerial,
      currentStamps: e.currentStamps,
      applePassId: e.applePassId ?? undefined,
      googleObjectId: e.googleObjectId ?? undefined,
      alreadyEnrolled: true,
    };
  }

  // issue the wallet pass OUTSIDE the transaction
  const ref = await provider.issuePass({
    serial: e.cardSerial,
    merchantName: created.merchantName,
    programName: created.program.name,
    rewardText: created.program.rewardText,
    currentStamps: created.program.bonusStamps,
    stampsRequired: created.program.stampsRequired,
    qrToken: e.cardSerial, // TODO(security): a signed, rotating token rather than the raw serial
  });

  // tx2 — persist the platform ids
  await withTenant(input.merchantId, (db) =>
    db
      .update(enrollments)
      .set({ applePassId: ref.applePassId, googleObjectId: ref.googleObjectId })
      .where(eq(enrollments.id, e.id)),
  );

  return {
    enrollmentId: e.id,
    serial: e.cardSerial,
    currentStamps: created.program.bonusStamps,
    applePassId: ref.applePassId,
    googleObjectId: ref.googleObjectId,
    alreadyEnrolled: false,
  };
}
