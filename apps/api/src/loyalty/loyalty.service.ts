import { Injectable } from "@nestjs/common";
import { withTenant, loyaltyPrograms, enrollments, stampEvents } from "@qrew/db";
import { eq, sql } from "drizzle-orm";

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
   *   2. recompute the balance FROM THE LEDGER (the source of truth) and cache it
   *      on the enrollment as a projection.
   * Both steps run in one tenant-scoped transaction.
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

      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${stampEvents.delta}), 0)` })
        .from(stampEvents)
        .where(eq(stampEvents.enrollmentId, input.enrollmentId));
      const currentStamps = Number(row?.total ?? 0);

      await db
        .update(enrollments)
        .set({ currentStamps })
        .where(eq(enrollments.id, input.enrollmentId));

      return { applied: inserted.length > 0, currentStamps };
    });
  }
}
