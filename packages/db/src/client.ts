import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_URL;
if (!appUrl || !adminUrl) {
  throw new Error("DATABASE_URL (and ideally DATABASE_URL_APP) must be set");
}

const appSql = postgres(appUrl, { max: 10 });
const adminSql = postgres(adminUrl, { max: 5 });

/** Application db — connects as `qrew_app`, which is SUBJECT to row-level security. */
export const appDb = drizzle(appSql, { schema });

/**
 * Admin db — connects as the owner/superuser, which BYPASSES RLS.
 * Use ONLY for migrations and deliberate cross-tenant system jobs (e.g. reconciliation).
 * Never expose it to a request handler.
 */
export const adminDb = drizzle(adminSql, { schema });

export type AppDb = typeof appDb;
/** The tenant-scoped transaction handle passed to `withTenant`. */
export type TenantDb = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

/**
 * Run a unit of work scoped to exactly one tenant.
 *
 * Sets `app.merchant_id` transaction-locally (`is_local = true`), so every RLS policy
 * filters to this merchant and the value is discarded when the transaction ends — no
 * leakage across pooled connections. This is the ONLY sanctioned way for the app to
 * read or write tenant data.
 */
export async function withTenant<T>(
  merchantId: string,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.merchant_id', ${merchantId}, true)`);
    return fn(tx);
  });
}

export async function closeDb(): Promise<void> {
  await Promise.all([appSql.end(), adminSql.end()]);
}
