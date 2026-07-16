import { Injectable } from "@nestjs/common";
import { withTenant, loyaltyPrograms } from "@qrew/db";
import { addStamp as coreAddStamp, redeem as coreRedeem, scanStamp as coreScan } from "@qrew/core";

@Injectable()
export class LoyaltyService {
  /** All programs for the tenant. RLS guarantees no other merchant's rows can appear. */
  listPrograms(merchantId: string) {
    return withTenant(merchantId, (db) => db.select().from(loyaltyPrograms));
  }

  /** Add one stamp by enrollment id — delegates to the shared domain layer. */
  addStamp(
    merchantId: string,
    input: { enrollmentId: string; idempotencyKey: string; locationId?: string; staffId?: string },
  ) {
    return coreAddStamp({ merchantId, ...input });
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
