import { Injectable } from "@nestjs/common";
import { withTenant, loyaltyPrograms } from "@qrew/db";
import { addStamp as coreAddStamp } from "@qrew/core";

@Injectable()
export class LoyaltyService {
  /** All programs for the tenant. RLS guarantees no other merchant's rows can appear. */
  listPrograms(merchantId: string) {
    return withTenant(merchantId, (db) => db.select().from(loyaltyPrograms));
  }

  /** Add one stamp — delegates to the shared domain layer (ledger + trigger + wallet sync). */
  addStamp(
    merchantId: string,
    input: { enrollmentId: string; idempotencyKey: string; locationId?: string; staffId?: string },
  ) {
    return coreAddStamp({ merchantId, ...input });
  }
}
