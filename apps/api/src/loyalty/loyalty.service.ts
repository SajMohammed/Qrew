import { Injectable } from "@nestjs/common";
import { withTenant, loyaltyPrograms, enrollments, stampEvents } from "@qrew/db";
import { eq } from "drizzle-orm";

@Injectable()
export class LoyaltyService {
  /** All programs for the tenant. RLS guarantees no other merchant's rows can appear. */
  listPrograms(merchantId: string) {
    return withTenant(merchantId, (db) => db.select().from(loyaltyPrograms));
  }

  /**
   * Add one stamp — the core correctness pattern:
   *   1. append to the append-only ledger; the unique (merchant_id, idempotency_key)
   *      makes a retried or double-tapped scan a no-op, not a double-stamp.
   *   2. the DB trigger (qrew_apply_stamp_delta) updates the cached projection
   *      (enrollments.current_stamps) atomically — no manual recompute, no drift.
   *      We just read the projection back.
   * Runs in one tenant-scoped transaction.
   */
  addStamp(
    merchantId: string,
    input: { enrollmentId: string; idempotencyKey: string; locationId?: string; staffId?: string },
  ) {
    return withTenant(merchantId, async (db) => {
      const inserted = await db
        .insert(stampEvents)
        .values({
          merchantId,
          enrollmentId: input.enrollmentId,
          idempotencyKey: input.idempotencyKey,
          locationId: input.locationId,
          staffId: input.staffId,
          delta: 1,
          source: "staff_scan",
        })
        .onConflictDoNothing({ target: [stampEvents.merchantId, stampEvents.idempotencyKey] })
        .returning();

      // current_stamps is maintained by the DB trigger; just read the projection back.
      const [enrollment] = await db
        .select({ currentStamps: enrollments.currentStamps })
        .from(enrollments)
        .where(eq(enrollments.id, input.enrollmentId));

      return { applied: inserted.length > 0, currentStamps: enrollment?.currentStamps ?? 0 };
    });
  }
}
