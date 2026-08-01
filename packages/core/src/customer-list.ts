import { sql } from "drizzle-orm";
import { withTenant, customers, enrollments, loyaltyProgressEvents, redemptions, loyaltyPrograms } from "@qrew/db";
import { AT_RISK_DAYS, REGULAR_VISITS } from "./analytics";

/**
 * The Customers tab — one row per person who has ever taken a card here, with the behaviour a shop
 * owner actually acts on: how often they come, when they were last in, and whether they're owed a
 * reward or drifting away.
 *
 * A customer can hold a card in more than one programme. Card progress shown here is their MOST
 * RECENT card; visits and redemptions are summed across all of them.
 */

export type CustomerFilter = "all" | "at_risk" | "reward_ready" | "regulars";
export type CustomerStatus = "reward_ready" | "at_risk" | "regular" | "new" | "active";

export interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  joinedAt: string;
  lastVisit: string | null;
  visits: number;
  redemptions: number;
  currentStamps: number | null;
  stampsRequired: number | null;
  rewardReady: boolean;
  status: CustomerStatus;
}

export interface CustomerListQuery {
  filter?: CustomerFilter;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CustomerList {
  rows: CustomerRow[];
  /** Total matching the current filter/search — the basis for paging, not the shop's headcount. */
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface RawRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  // Raw `execute` hands timestamps back as driver-formatted strings rather than the Date objects the
  // typed query builder produces, so these are normalised on the way out.
  joined_at: Date | string;
  last_visit: Date | string | null;
  visits: number;
  redemptions: number;
  current_progress: number | null;
  stamps_required: number | null;
  reward_ready: boolean | null;
  at_risk: boolean;
  total_count: number;
}

export async function listCustomers(
  merchantId: string,
  query: CustomerListQuery = {},
): Promise<CustomerList> {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(query.offset ?? 0, 0);
  const filter: CustomerFilter = query.filter ?? "all";
  const search = query.search?.trim() ?? "";

  return withTenant(merchantId, async (db) => {
    // ILIKE wildcards are meaningful characters, so a customer literally searching "50%" must not
    // turn into a match-everything pattern.
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const conditions = [
      filter === "reward_ready" ? sql`reward_ready` : null,
      filter === "at_risk" ? sql`at_risk` : null,
      filter === "regulars" ? sql`visits >= ${REGULAR_VISITS}` : null,
      search
        ? sql`(name ilike ${pattern} or email ilike ${pattern} or phone ilike ${pattern})`
        : null,
    ].filter((c): c is NonNullable<typeof c> => c !== null);

    const where = conditions.length
      ? sql`where ${sql.join(conditions, sql` and `)}`
      : sql``;

    // Lateral joins keep this one row per customer: the newest card for display, and full-history
    // rollups for behaviour. count(*) over () rides along so paging doesn't need a second query.
    const rows = (await db.execute(sql`
      with base as (
        select
          c.id, c.name, c.email, c.phone,
          c.created_at as joined_at,
          card.current_progress,
          card.stamps_required,
          coalesce(card.current_progress >= card.stamps_required, false) as reward_ready,
          coalesce(v.visits, 0)::int      as visits,
          v.last_visit,
          coalesce(r.redemptions, 0)::int as redemptions,
          coalesce(v.last_visit, c.created_at) < now() - make_interval(days => ${AT_RISK_DAYS}) as at_risk
        from ${customers} c
        left join lateral (
          select e.current_progress, lp.stamps_required
          from ${enrollments} e
          join ${loyaltyPrograms} lp on lp.id = e.program_id
          where e.customer_id = c.id
          order by e.created_at desc
          limit 1
        ) card on true
        left join lateral (
          select count(se.id) as visits, max(se.created_at) as last_visit
          from ${enrollments} e
          join ${loyaltyProgressEvents} se on se.enrollment_id = e.id and se.source = 'staff_scan'
          where e.customer_id = c.id
        ) v on true
        left join lateral (
          select count(rd.id) as redemptions
          from ${enrollments} e
          join ${redemptions} rd on rd.enrollment_id = e.id
          where e.customer_id = c.id
        ) r on true
      )
      select *, count(*) over ()::int as total_count
      from base
      ${where}
      order by last_visit desc nulls last, joined_at desc
      limit ${limit} offset ${offset}
    `)) as unknown as RawRow[];

    return {
      rows: rows.map((r) => {
        const rewardReady = r.reward_ready === true;
        return {
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          joinedAt: toIso(r.joined_at),
          lastVisit: r.last_visit === null ? null : toIso(r.last_visit),
          visits: Number(r.visits),
          redemptions: Number(r.redemptions),
          currentStamps: r.current_progress === null ? null : Number(r.current_progress),
          stampsRequired: r.stamps_required === null ? null : Number(r.stamps_required),
          rewardReady,
          status: statusOf(rewardReady, r.at_risk, Number(r.visits)),
        };
      }),
      total: Number(rows[0]?.total_count ?? 0),
      limit,
      offset,
    };
  });
}

/** Timestamps cross the wire as ISO strings, whatever shape the driver handed us. */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Most-actionable-first: an owed reward is a thing to hand over today, and going quiet is a thing to
 * chase — both outrank the descriptive "regular"/"new" labels.
 */
function statusOf(rewardReady: boolean, atRisk: boolean, visits: number): CustomerStatus {
  if (rewardReady) return "reward_ready";
  if (atRisk) return "at_risk";
  if (visits >= REGULAR_VISITS) return "regular";
  if (visits <= 1) return "new";
  return "active";
}
