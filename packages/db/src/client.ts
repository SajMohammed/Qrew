import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

// No fallback from one to the other: an app pool on the owner's URL would bypass row-level
// security, so a missing DATABASE_URL_APP has to stop the process, not quietly widen it.
const appUrl = process.env.DATABASE_URL_APP;
const adminUrl = process.env.DATABASE_URL;
if (!appUrl || !adminUrl) {
  throw new Error("DATABASE_URL and DATABASE_URL_APP must both be set");
}

const appSql = postgres(appUrl, { max: 10 });
const adminSql = postgres(adminUrl, { max: 5 });

/** Application db — connects as `qrew_app`, which is SUBJECT to row-level security. */
export const appDb = drizzle(appSql, { schema });

/**
 * Admin db — connects as the tables' owner, which BYPASSES RLS (it is not FORCEd; see 0012).
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

/**
 * Refuse to run if the app connection would bypass row-level security.
 *
 * Tenant isolation is only as strong as the role `appDb` connects as. A superuser, a BYPASSRLS
 * role, or the tables' owner — or any role inheriting the owner's privileges — sees every
 * merchant's rows, and nothing in a query would show it. Call at boot, so a misconfigured
 * DATABASE_URL_APP stops the process instead of serving one shop's customers to another.
 */
export async function assertAppRoleIsolated(): Promise<void> {
  const [row] = await appSql<{ role: string; superuser: boolean; bypassrls: boolean; owner: boolean }[]>`
    select current_user as role,
           r.rolsuper as superuser,
           r.rolbypassrls as bypassrls,
           exists (
             select 1 from pg_tables
              where schemaname = 'public' and pg_has_role(current_user, tableowner, 'USAGE')
           ) as owner
      from pg_roles r
     where r.rolname = current_user`;
  if (!row || row.superuser || row.bypassrls || row.owner) {
    const why = !row ? "an unknown role" : row.superuser ? "a superuser" : row.bypassrls ? "a BYPASSRLS role" : "the tables' owner";
    throw new Error(
      `Refusing to start: DATABASE_URL_APP connects as "${row?.role}", ${why}, which bypasses row-level security. Point it at the qrew_app role.`,
    );
  }
}

export async function closeDb(): Promise<void> {
  await Promise.all([appSql.end(), adminSql.end()]);
}
