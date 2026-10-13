import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { withTenant, staff, type TenantDb } from "@qrew/db";
import { InvalidInputError, NotFoundError, TooManyAttemptsError } from "./errors";
import { WindowCounter } from "./rate-window";
import { mintStaffToken, verifyStaffToken } from "./token";

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

/*
 * PIN hashing via scrypt (node:crypto — no native dep). Stored as `<saltHex>:<hashHex>`.
 *
 * Async on purpose: scrypt is deliberately slow (~80ms), and the sync version blocked the event
 * loop for every PIN-holding staff member on every check — one person at the till typing PINs
 * stalled every other request the API was serving.
 */
const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(pin, salt, 32);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = await scrypt(pin, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** A short fingerprint of a PIN hash, carried in shift tokens so changing the PIN revokes them. */
export function pinTag(pinHash: string): string {
  return createHash("sha256").update(pinHash).digest("base64url").slice(0, 16);
}

/**
 * Refuse a PIN someone else on the team already uses. A PIN is what tells the till who is working,
 * so two people sharing one would put one person's scans under the other's name. Checked by
 * comparing against every hash — salted hashes can't carry a unique index — which is fine for a
 * team of a few people and a rare owner action.
 */
async function assertPinFree(db: TenantDb, pin: string, exceptStaffId?: string): Promise<void> {
  const rows = await db.select({ id: staff.id, pinHash: staff.pinHash }).from(staff).where(isNotNull(staff.pinHash));
  for (const r of rows) {
    if (r.id !== exceptStaffId && r.pinHash && (await pinMatches(pin, r.pinHash))) {
      throw new InvalidInputError("That PIN is already used by someone on your team — choose a different one.");
    }
  }
}

/** An owner/manager adds a staff member with a counter PIN (defaults to the cashier role). */
export async function addStaffPin(
  merchantId: string,
  input: { name: string; pin: string; role?: string },
): Promise<StaffIdentity> {
  const pinHash = await hashPin(input.pin); // the slow part, before the transaction opens
  return withTenant(merchantId, async (db) => {
    await assertPinFree(db, input.pin);
    const [s] = await db
      .insert(staff)
      .values({ merchantId, name: input.name, role: input.role ?? "cashier", pinHash })
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

/** Replace a staff member's counter PIN. Their open shift token stops working (see pinTag). */
export async function setStaffPin(
  merchantId: string,
  staffId: string,
  pin: string,
): Promise<StaffMember> {
  const pinHash = await hashPin(pin);
  return withTenant(merchantId, async (db) => {
    await assertPinFree(db, pin, staffId);
    const [updated] = await db.update(staff).set({ pinHash }).where(eq(staff.id, staffId)).returning();
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

/*
 * Wrong PINs, counted per shop. A PIN is 4-6 digits, so guessing has to be slowed: 5 misses in 15
 * minutes pauses PIN entry, and 20 in a day pauses it for the rest of that day (a 15-minute cap
 * alone would still allow ~480 guesses a day). Per shop because the threat is whoever holds the
 * counter device, which is signed in as the shop. A correct PIN does not reset the count, or a
 * cashier could mix in their own PIN to keep guessing someone else's. Signing out always remains
 * as a way off a locked counter.
 */
const PIN_BURST = new WindowCounter(5, 15 * 60_000);
const PIN_DAILY = new WindowCounter(20, 24 * 60 * 60_000);

/*
 * A shop's PIN checks run one at a time. The lockout is decided before a check and a miss counted
 * after it, so checks running side by side would each pass the gate before any of them had missed —
 * a burst of every 4-digit PIN at once would all be tried. Taking turns also keeps a burst from
 * filling the thread pool with scrypt work. (Per process, like the counters themselves.)
 */
const pinTurns = new Map<string, Promise<void>>();

async function inTurn<T>(merchantId: string, work: () => Promise<T>): Promise<T> {
  const before = pinTurns.get(merchantId) ?? Promise.resolve();
  let done!: () => void;
  const mine = before.then(() => new Promise<void>((resolve) => (done = resolve)));
  pinTurns.set(merchantId, mine);
  await before;
  try {
    return await work();
  } finally {
    done();
    if (pinTurns.get(merchantId) === mine) pinTurns.delete(merchantId);
  }
}

/**
 * Resolve a counter PIN to a staff member within the merchant (RLS-scoped), with a shift token for
 * attributing their scans. Null if no PIN matches. Throws TooManyAttemptsError while PIN entry is
 * paused — even for a correct PIN, or the pause would be no pause at all.
 */
export function verifyStaffPin(
  merchantId: string,
  pin: string,
): Promise<(StaffIdentity & { staffToken: string }) | null> {
  return inTurn(merchantId, () => checkPin(merchantId, pin));
}

async function checkPin(merchantId: string, pin: string): Promise<(StaffIdentity & { staffToken: string }) | null> {
  const wait = Math.max(PIN_BURST.blockedFor(merchantId), PIN_DAILY.blockedFor(merchantId));
  if (wait > 0) {
    const seconds = Math.ceil(wait / 1000);
    const minutes = Math.ceil(seconds / 60);
    throw new TooManyAttemptsError(
      "pin_locked",
      seconds,
      `Too many wrong PINs. PIN entry is paused for ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }

  const rows = await withTenant(merchantId, (db) =>
    db
      .select({ id: staff.id, name: staff.name, role: staff.role, pinHash: staff.pinHash })
      .from(staff)
      .where(and(eq(staff.merchantId, merchantId), isNotNull(staff.pinHash))),
  );
  // Compared outside the transaction: a slow hash per row shouldn't hold a database connection.
  for (const r of rows) {
    if (r.pinHash && (await pinMatches(pin, r.pinHash))) {
      return {
        staffId: r.id,
        name: r.name,
        role: r.role,
        staffToken: mintStaffToken({ merchantId, staffId: r.id, pinTag: pinTag(r.pinHash) }),
      };
    }
  }

  PIN_BURST.hit(merchantId);
  PIN_DAILY.hit(merchantId);
  return null;
}

/**
 * The staff member a shift token attributes a scan to, or null if it no longer may: wrong shop,
 * person removed, or PIN changed since it was minted.
 */
export async function resolveStaffToken(merchantId: string, token: string): Promise<string | null> {
  const claims = verifyStaffToken(token);
  if (!claims || claims.merchantId !== merchantId) return null;
  const [row] = await withTenant(merchantId, (db) =>
    db.select({ pinHash: staff.pinHash }).from(staff).where(eq(staff.id, claims.staffId)),
  );
  return row?.pinHash && pinTag(row.pinHash) === claims.pinTag ? claims.staffId : null;
}
