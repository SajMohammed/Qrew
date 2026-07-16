import { eq } from "drizzle-orm";
import { withTenant, enrollments } from "@qrew/db";
import { addStamp, type StampResult } from "./stamp";

export type ScanResult = { found: false } | ({ found: true } & StampResult);

export interface ScanInput {
  merchantId: string;
  serial: string;
  idempotencyKey: string;
  staffId?: string;
}

/**
 * Staff scans a customer's card QR (which encodes the card serial). We resolve the serial
 * to an enrollment WITHIN the staff's tenant — RLS guarantees a card from another merchant
 * simply isn't found ("not your customer") — then apply a stamp.
 */
export async function scanStamp(input: ScanInput): Promise<ScanResult> {
  const enrollmentId = await withTenant(input.merchantId, async (db) => {
    const [row] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(eq(enrollments.cardSerial, input.serial));
    return row?.id ?? null;
  });

  if (!enrollmentId) return { found: false };

  const result = await addStamp({
    merchantId: input.merchantId,
    enrollmentId,
    idempotencyKey: input.idempotencyKey,
    staffId: input.staffId,
  });
  return { found: true, ...result };
}
