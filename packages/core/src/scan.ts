import { and, count, eq, type SQL } from "drizzle-orm";
import { withTenant, enrollments, loyaltyPrograms } from "@qrew/db";
import { isCardType, type CardType } from "./card-types";
import type { ProgramStatus } from "./program";
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
      /** Which of the shop's cards this is: a shop can run one of each type. */
      program: { id: string; name: string; type: CardType; status: ProgramStatus };
      /** How many cards the shop has on. With two or more, the counter names the card it scanned. */
      cardsRunning: number;
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
      .select({
        id: enrollments.id,
        shortCode: enrollments.shortCode,
        program: {
          id: loyaltyPrograms.id,
          name: loyaltyPrograms.name,
          type: loyaltyPrograms.type,
          status: loyaltyPrograms.status,
        },
      })
      .from(enrollments)
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
      .where(cardMatch(input.merchantId, input.serial));
    if (!row) return null;
    const [running] = await db
      .select({ n: count() })
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.status, "active"));
    return { ...row, cardsRunning: running?.n ?? 0 };
  });

  if (!card) return { found: false };

  const result = await addStamp({
    merchantId: input.merchantId,
    enrollmentId: card.id,
    idempotencyKey: input.idempotencyKey,
    staffId: input.staffId,
  });
  return {
    found: true,
    enrollmentId: card.id,
    shortCode: formatShortCode(card.shortCode),
    program: {
      ...card.program,
      type: isCardType(card.program.type) ? card.program.type : "stamp",
      status: card.program.status === "frozen" ? "frozen" : "active",
    },
    cardsRunning: card.cardsRunning,
    ...result,
  };
}
