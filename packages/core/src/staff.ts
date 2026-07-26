import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { withTenant, staff } from "@qrew/db";

export interface StaffIdentity {
  staffId: string;
  name: string;
  role: string;
}

// PIN hashing via scrypt (node:crypto — no native dep). Stored as `<saltHex>:<hashHex>`.
function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(pin, salt, 32);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

function pinMatches(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = scryptSync(pin, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** An owner/manager adds a staff member with a counter PIN (defaults to the cashier role). */
export async function addStaffPin(
  merchantId: string,
  input: { name: string; pin: string; role?: string },
): Promise<StaffIdentity> {
  return withTenant(merchantId, async (db) => {
    const [s] = await db
      .insert(staff)
      .values({ merchantId, name: input.name, role: input.role ?? "cashier", pinHash: hashPin(input.pin) })
      .returning();
    return { staffId: s!.id, name: s!.name, role: s!.role };
  });
}

/** Resolve a counter PIN to a staff member within the merchant (RLS-scoped). Null if no match. */
export async function verifyStaffPin(merchantId: string, pin: string): Promise<StaffIdentity | null> {
  return withTenant(merchantId, async (db) => {
    const rows = await db
      .select({ id: staff.id, name: staff.name, role: staff.role, pinHash: staff.pinHash })
      .from(staff)
      .where(and(eq(staff.merchantId, merchantId), isNotNull(staff.pinHash)));
    for (const r of rows) {
      if (r.pinHash && pinMatches(pin, r.pinHash)) return { staffId: r.id, name: r.name, role: r.role };
    }
    return null;
  });
}
