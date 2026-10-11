import { Injectable } from "@nestjs/common";
import { withTenant, loyaltyPrograms } from "@qrew/db";
import { addStamp as coreAddStamp, redeem as coreRedeem, scanStamp as coreScan } from "@qrew/core";

@Injectable()
export class LoyaltyService {
  /** All programs for the tenant. RLS guarantees no other merchant's rows can appear. */
  listPrograms(merchantId: string) {
    return withTenant(merchantId, (db) => db.select().from(loyaltyPrograms));
  }

  /**
   * Add one stamp by enrollment id. Never a camera read — only a press of the counter's "Add another
   * stamp" (or the card app's dev simulate button) — so it is deliberate and the cooldown against a
   * double read does not apply. The idempotency key still does.
   */
  addStamp(
    merchantId: string,
    input: { enrollmentId: string; idempotencyKey: string; locationId?: string; staffId?: string },
  ) {
    return coreAddStamp({ merchantId, ...input, deliberate: true });
  }

  /** Add one stamp by scanned card serial (the staff-scanner path). */
  scan(merchantId: string, input: { serial: string; idempotencyKey: string; staffId?: string }) {
    return coreScan({ merchantId, ...input });
  }

  /** Redeem a reward — verify-at-ledger + wallet sync. */
  redeem(merchantId: string, input: { enrollmentId: string; idempotencyKey: string; staffId?: string }) {
    return coreRedeem({ merchantId, ...input });
  }
}
