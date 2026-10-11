import { and, eq, type SQL } from "drizzle-orm";
import { withTenant, enrollments } from "@qrew/db";
import { addStamp, type StampResult } from "./stamp";
import { formatShortCode, normalizeShortCode } from "./short-code";
import { verifyCardToken } from "./token";

export type ScanResult =
  | { found: false }
  | ({
      found: true;
      enrollmentId: string;
      /** The card's code, formatted — so the counter can show which card it is acting on. */
      shortCode: string;
    } & StampResult);

export interface ScanInput {
  merchantId: string;
  /** The scanned or typed value: a rotating signed token, a raw serial, or a short card code. */
  serial: string;
  idempotencyKey: string;
  staffId?: string;
}

/**
 * Which card a value names, tried in this order:
 *   - a signed card token — the customer app's QR;
 *   - a short code typed at this shop's counter, when a QR won't read;
 *   - a raw serial — a Google pass barcode.
 */
function cardMatch(merchantId: string, value: string): SQL {
  const serial = verifyCardToken(value);
  if (serial) return eq(enrollments.cardSerial, serial);
  const code = normalizeShortCode(value);
  if (code) return and(eq(enrollments.merchantId, merchantId), eq(enrollments.shortCode, code))!;
  return eq(enrollments.cardSerial, value);
}

/**
 * Staff scans a customer's card QR, or types its short code. The value is resolved to an enrollment
 * WITHIN the staff's tenant — RLS guarantees a card from another merchant simply isn't found — and a
 * stamp is applied.
 */
export async function scanStamp(input: ScanInput): Promise<ScanResult> {
  const card = await withTenant(input.merchantId, async (db) => {
    const [row] = await db
      .select({ id: enrollments.id, shortCode: enrollments.shortCode })
      .from(enrollments)
      .where(cardMatch(input.merchantId, input.serial));
    return row ?? null;
  });

  if (!card) return { found: false };

  const result = await addStamp({
    merchantId: input.merchantId,
    enrollmentId: card.id,
    idempotencyKey: input.idempotencyKey,
    staffId: input.staffId,
  });
  return { found: true, enrollmentId: card.id, shortCode: formatShortCode(card.shortCode), ...result };
}
