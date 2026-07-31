import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { withTenant, staff } from "@qrew/db";
import { NotFoundError } from "./errors";

export interface StaffIdentity {
  staffId: string;
  name: string;
  role: string;
}

/** A staff member as the owner sees them. Never carries the PIN hash. */
export interface StaffMember {
  id: string;
  name: string;
  role: string;
  /** Whether a counter PIN is set — the owner needs to see who can actually work the till. */
  hasPin: boolean;
  /** True when this row is tied to a real login (Clerk), i.e. an owner/manager of the shop. */
  linkedAccount: boolean;
  createdAt: string;
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

/** Everyone on the team, for the owner's staff screen. Hashes never leave this module. */
export async function listStaff(merchantId: string): Promise<StaffMember[]> {
  return withTenant(merchantId, async (db) => {
    const rows = await db
      .select({
        id: staff.id,
        name: staff.name,
        role: staff.role,
        pinHash: staff.pinHash,
        externalAuthId: staff.externalAuthId,
        createdAt: staff.createdAt,
      })
      .from(staff)
      .orderBy(asc(staff.createdAt));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      hasPin: Boolean(r.pinHash),
      linkedAccount: Boolean(r.externalAuthId),
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

/** Replace a staff member's counter PIN. */
export async function setStaffPin(
  merchantId: string,
  staffId: string,
  pin: string,
): Promise<StaffMember> {
  return withTenant(merchantId, async (db) => {
    const [updated] = await db
      .update(staff)
      .set({ pinHash: hashPin(pin) })
      .where(eq(staff.id, staffId))
      .returning();
    if (!updated) throw new NotFoundError("staff member not found");
    return {
      id: updated.id,
      name: updated.name,
      role: updated.role,
      hasPin: true,
      linkedAccount: Boolean(updated.externalAuthId),
      createdAt: updated.createdAt.toISOString(),
    };
  });
}

/**
 * Remove a staff member.
 *
 * Refuses to delete a row tied to a login. `staff` is what maps a Clerk user to this merchant, so
 * deleting an owner's own row would strand them: the guard would answer "needs onboarding" on their
 * next request and happily provision them a brand-new empty shop, orphaning this one.
 */
export async function removeStaff(merchantId: string, staffId: string): Promise<void> {
  return withTenant(merchantId, async (db) => {
    const [row] = await db.select().from(staff).where(eq(staff.id, staffId));
    if (!row) throw new NotFoundError("staff member not found");
    if (row.externalAuthId) {
      throw new NotFoundError("this team member signs in with their own account and can't be removed here");
    }
    await db.delete(staff).where(eq(staff.id, staffId));
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
