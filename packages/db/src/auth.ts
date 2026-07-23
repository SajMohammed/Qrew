import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { adminDb } from "./client";
import { merchants, staff } from "./schema";

/** A Clerk user's staff membership at one merchant. */
export interface StaffTenancy {
  merchantId: string;
  role: string;
  staffId: string;
}

// Resolve which merchant(s) + role a Clerk userId is staff of. Uses adminDb deliberately: this
// runs at auth time, BEFORE app.merchant_id is set, and staff is force-RLS — so it must bypass
// RLS (same sanctioned admin path as getCard/createLead). Cached briefly; userId is stable.
const cache = new Map<string, { at: number; rows: StaffTenancy[] }>();
const CACHE_TTL_MS = 30_000;

export async function resolveStaffByClerkUser(userId: string): Promise<StaffTenancy[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const rows = await adminDb
    .select({ merchantId: staff.merchantId, role: staff.role, staffId: staff.id })
    .from(staff)
    .where(eq(staff.externalAuthId, userId));
  cache.set(userId, { at: Date.now(), rows });
  return rows;
}

/** Drop a cached membership — call after provisioning or staff changes. */
export function invalidateStaffCache(userId: string): void {
  cache.delete(userId);
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "merchant";
  return `${base}-${randomBytes(3).toString("hex")}`; // random suffix keeps the unique slug collision-free
}

/**
 * First-login onboarding: create a merchant + an owner staff row linked to the Clerk user.
 * Idempotent — if this user already owns a merchant, returns that merchant's id and creates nothing.
 */
export async function provisionMerchantForOwner(input: { userId: string; name: string }): Promise<string> {
  const existing = await resolveStaffByClerkUser(input.userId);
  if (existing.length > 0) return existing[0]!.merchantId;

  const merchantId = await adminDb.transaction(async (tx) => {
    const [m] = await tx
      .insert(merchants)
      .values({ name: input.name, slug: slugify(input.name) })
      .returning();
    await tx.insert(staff).values({
      merchantId: m!.id,
      externalAuthId: input.userId,
      name: input.name,
      role: "owner",
    });
    return m!.id;
  });
  invalidateStaffCache(input.userId);
  return merchantId;
}
