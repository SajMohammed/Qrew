import { eq } from "drizzle-orm";
import { withTenant, enrollments } from "@qrew/db";
import { addStamp, type StampResult } from "./stamp";
import { verifyCardToken } from "./token";

export type ScanResult = { found: false } | ({ found: true; enrollmentId: string } & StampResult);

export interface ScanInput {
  merchantId: string;
  /** The scanned value: a rotating signed token (preferred) or a raw serial (dev/manual). */
  serial: string;
  idempotencyKey: string;
  staffId?: string;
}

/**
 * Staff scans a customer's card QR. The QR carries a short-lived signed token; we verify it
 * back to the serial (falling back to treating the value as a raw serial for dev/manual entry).
 * The serial is then resolved to an enrollment WITHIN the staff's tenant — RLS guarantees a
 * card from another merchant simply isn't found — and a stamp is applied.
 */
export async function scanStamp(input: ScanInput): Promise<ScanResult> {
  const serial = verifyCardToken(input.serial) ?? input.serial;

  const enrollmentId = await withTenant(input.merchantId, async (db) => {
    const [row] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(eq(enrollments.cardSerial, serial));
    return row?.id ?? null;
  });

  if (!enrollmentId) return { found: false };

  const result = await addStamp({
    merchantId: input.merchantId,
    enrollmentId,
    idempotencyKey: input.idempotencyKey,
    staffId: input.staffId,
  });
  return { found: true, enrollmentId, ...result };
}
