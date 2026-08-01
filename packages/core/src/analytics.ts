import { and, desc, eq, sql } from "drizzle-orm";
import {
  withTenant,
  merchants,
  loyaltyPrograms,
  customers,
  enrollments,
  loyaltyProgressEvents,
  redemptions,
} from "@qrew/db";

/**
 * Shop analytics — the owner-facing read model behind the dashboard.
 *
 * Vocabulary, fixed here so every panel agrees:
 *  - a VISIT is a `staff_scan` stamp event. The signup bonus is not a visit (nobody walked in for
 *    it) and a redemption is a spend, not an arrival.
 *  - STAMPS ISSUED is the sum of positive deltas, so a 2-stamp signup bonus counts as 2 — unlike
 *    the older `getDashboard` stat, which counted ledger rows.
 *  - every number is tenant-scoped by RLS via `withTenant`; no query filters on merchant_id by hand.
 */

export type AnalyticsRange = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

// Shared with the customer list so the dashboard's "9 at risk" and the Customers tab's
// at-risk filter can never disagree.
/** No visit in this long and the customer has gone quiet — the "win back" list. */
export const AT_RISK_DAYS = 14;
/** Ladder tiers: a "return" is a second visit; a "regular" keeps coming back. */
export const RETURNED_VISITS = 2;
export const REGULAR_VISITS = 5;
/** Qrew is UAE-first: day buckets must line up with the owner's day, not UTC. */
const SHOP_TZ = "Asia/Dubai";
/** Longer than a month is bucketed by week — 90 daily bars is not a readable chart. */
const DAILY_MAX_DAYS = 30;
const WEEKLY_BUCKETS = 13;
const FEED_LIMIT = 8;
const TOP_REGULARS = 5;

/** A headline number plus the same measure over the immediately preceding window. */
export interface Kpi {
  value: number;
  previous: number;
}

export interface ActivityItem {
  id: string;
  kind: "stamp" | "redeem" | "join";
  at: string;
  customerName: string | null;
  customerEmail: string | null;
  /** Card progress — present for stamp/join, null for a redemption. */
  currentStamps: number | null;
  stampsRequired: number | null;
  /** What was redeemed — present only for `redeem`. */
  rewardText: string | null;
}

export interface TopRegular {
  customerId: string;
  name: string | null;
  email: string | null;
  visits: number;
}

export interface ShopAnalytics {
  merchantId: string;
  merchantName: string;
  range: AnalyticsRange;
  /** Total customers ever, and how many joined in this window vs the one before it. */
  customers: Kpi & { total: number };
  stampsIssued: Kpi;
  rewardsRedeemed: Kpi;
  /** Share of visiting customers who came back at least twice, 0-100. */
  repeatRate: Kpi;
  actions: { rewardReady: number; atRisk: number; atRiskDays: number };
  series: { bucket: "day" | "week"; points: { date: string; stamps: number }[] };
  ladder: { joined: number; returned: number; regulars: number; earnedReward: number };
  activity: ActivityItem[];
  topRegulars: TopRegular[];
}

/** Raw shape of the one-row aggregate that powers the ladder, repeat rate and at-risk count. */
interface CohortRow {
  joined: number;
  returned: number;
  regulars: number;
  earned_reward: number;
  with_visits: number;
  prev_with_visits: number;
  prev_returned: number;
  at_risk: number;
}

export async function getShopAnalytics(
  merchantId: string,
  range: AnalyticsRange = "30d",
): Promise<ShopAnalytics> {
  const days = RANGE_DAYS[range];
  const weekly = days > DAILY_MAX_DAYS;

  return withTenant(merchantId, async (db) => {
    const [merchant] = await db.select({ name: merchants.name }).from(merchants);

    // ── headline counters ─────────────────────────────────────────────────────────
    // Both windows come from one pass over the ledger, bounded to 2× the range so the
    // (merchant_id, created_at) index does the work instead of scanning all history.
    const [stamps] = await db
      .select({
        value: sql<number>`coalesce(sum(${loyaltyProgressEvents.delta}) filter (
          where ${loyaltyProgressEvents.delta} > 0
            and ${loyaltyProgressEvents.createdAt} >= now() - make_interval(days => ${days})), 0)::int`,
        previous: sql<number>`coalesce(sum(${loyaltyProgressEvents.delta}) filter (
          where ${loyaltyProgressEvents.delta} > 0
            and ${loyaltyProgressEvents.createdAt} <  now() - make_interval(days => ${days})), 0)::int`,
      })
      .from(loyaltyProgressEvents)
      .where(sql`${loyaltyProgressEvents.createdAt} >= now() - make_interval(days => ${days * 2})`);

    const [redeemed] = await db
      .select({
        value: sql<number>`count(*) filter (
          where ${redemptions.createdAt} >= now() - make_interval(days => ${days}))::int`,
        previous: sql<number>`count(*) filter (
          where ${redemptions.createdAt} <  now() - make_interval(days => ${days}))::int`,
      })
      .from(redemptions)
      .where(sql`${redemptions.createdAt} >= now() - make_interval(days => ${days * 2})`);

    // Customers is a lifetime total; the two windows describe how many joined, not how many exist.
    const [cust] = await db
      .select({
        total: sql<number>`count(*)::int`,
        value: sql<number>`count(*) filter (
          where ${customers.createdAt} >= now() - make_interval(days => ${days}))::int`,
        previous: sql<number>`count(*) filter (
          where ${customers.createdAt} >= now() - make_interval(days => ${days * 2})
            and ${customers.createdAt} <  now() - make_interval(days => ${days}))::int`,
      })
      .from(customers);

    const [ready] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(enrollments)
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
      .where(sql`${enrollments.currentProgress} >= ${loyaltyPrograms.stampsRequired}`);

    // ── the cohort aggregate ──────────────────────────────────────────────────────
    // One pass over (enrollments ⨝ ledger) grouped per customer answers the retention ladder, both
    // repeat rates and the at-risk list. `prev_visits` re-runs the same tally as of the start of this
    // window, which is what makes "repeat rate ▲5%" an honest comparison rather than a guess.
    const cohortRows = (await db.execute(sql`
      with v as (
        select
          e.customer_id                                                        as cid,
          min(e.created_at)                                                    as joined_at,
          count(se.id) filter (where se.source = 'staff_scan')                 as visits,
          count(se.id) filter (where se.source = 'staff_scan'
                                 and se.created_at < now() - make_interval(days => ${days})) as prev_visits,
          max(se.created_at) filter (where se.source = 'staff_scan')           as last_visit
        from ${enrollments} e
        left join ${loyaltyProgressEvents} se on se.enrollment_id = e.id
        group by e.customer_id
      ),
      rewarded as (
        select distinct e.customer_id as cid
        from ${redemptions} rd
        join ${enrollments} e on e.id = rd.enrollment_id
      )
      select
        (select count(*) from v)::int                                             as joined,
        (select count(*) from v where visits >= ${RETURNED_VISITS})::int          as returned,
        (select count(*) from v where visits >= ${REGULAR_VISITS})::int           as regulars,
        (select count(*) from rewarded)::int                                      as earned_reward,
        (select count(*) from v where visits >= 1)::int                           as with_visits,
        (select count(*) from v where prev_visits >= 1)::int                      as prev_with_visits,
        (select count(*) from v where prev_visits >= ${RETURNED_VISITS})::int     as prev_returned,
        (select count(*) from v
          where coalesce(last_visit, joined_at) < now() - make_interval(days => ${AT_RISK_DAYS}))::int as at_risk
    `)) as unknown as CohortRow[];
    const cohort = cohortRows[0];

    // ── the activity chart ────────────────────────────────────────────────────────
    // generate_series zero-fills quiet days so the chart shows a real gap instead of closing it up.
    const seriesRows = (await db.execute(
      weekly
        ? sql`
            select to_char(d, 'YYYY-MM-DD') as date, coalesce(s.total, 0)::int as stamps
            from generate_series(
              date_trunc('week', (now() at time zone ${SHOP_TZ})) - make_interval(weeks => ${WEEKLY_BUCKETS - 1}),
              date_trunc('week', (now() at time zone ${SHOP_TZ})),
              interval '1 week') as d
            left join (
              select date_trunc('week', (${loyaltyProgressEvents.createdAt} at time zone ${SHOP_TZ})) as bucket,
                     sum(${loyaltyProgressEvents.delta}) as total
              from ${loyaltyProgressEvents}
              where ${loyaltyProgressEvents.delta} > 0
                and ${loyaltyProgressEvents.createdAt} >= now() - make_interval(weeks => ${WEEKLY_BUCKETS})
              group by 1
            ) s on s.bucket = d
            order by d`
        : sql`
            select to_char(d, 'YYYY-MM-DD') as date, coalesce(s.total, 0)::int as stamps
            from generate_series(
              date_trunc('day', (now() at time zone ${SHOP_TZ})) - make_interval(days => ${days - 1}),
              date_trunc('day', (now() at time zone ${SHOP_TZ})),
              interval '1 day') as d
            left join (
              select date_trunc('day', (${loyaltyProgressEvents.createdAt} at time zone ${SHOP_TZ})) as bucket,
                     sum(${loyaltyProgressEvents.delta}) as total
              from ${loyaltyProgressEvents}
              where ${loyaltyProgressEvents.delta} > 0
                and ${loyaltyProgressEvents.createdAt} >= now() - make_interval(days => ${days})
              group by 1
            ) s on s.bucket = d
            order by d`,
    )) as unknown as { date: string; stamps: number }[];

    // ── the feed ──────────────────────────────────────────────────────────────────
    // Three small indexed reads merged in memory beats one UNION the planner can't index well.
    const recentStamps = await db
      .select({
        id: loyaltyProgressEvents.id,
        at: loyaltyProgressEvents.createdAt,
        customerName: customers.name,
        customerEmail: customers.email,
        currentStamps: enrollments.currentProgress,
        stampsRequired: loyaltyPrograms.stampsRequired,
      })
      .from(loyaltyProgressEvents)
      .innerJoin(enrollments, eq(enrollments.id, loyaltyProgressEvents.enrollmentId))
      .innerJoin(customers, eq(customers.id, enrollments.customerId))
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
      .where(eq(loyaltyProgressEvents.source, "staff_scan"))
      .orderBy(desc(loyaltyProgressEvents.createdAt))
      .limit(FEED_LIMIT);

    const recentRedeems = await db
      .select({
        id: redemptions.id,
        at: redemptions.createdAt,
        customerName: customers.name,
        customerEmail: customers.email,
        rewardText: redemptions.rewardText,
      })
      .from(redemptions)
      .innerJoin(enrollments, eq(enrollments.id, redemptions.enrollmentId))
      .innerJoin(customers, eq(customers.id, enrollments.customerId))
      .orderBy(desc(redemptions.createdAt))
      .limit(FEED_LIMIT);

    const recentJoins = await db
      .select({
        id: enrollments.id,
        at: enrollments.createdAt,
        customerName: customers.name,
        customerEmail: customers.email,
        currentStamps: enrollments.currentProgress,
        stampsRequired: loyaltyPrograms.stampsRequired,
      })
      .from(enrollments)
      .innerJoin(customers, eq(customers.id, enrollments.customerId))
      .innerJoin(loyaltyPrograms, eq(loyaltyPrograms.id, enrollments.programId))
      .orderBy(desc(enrollments.createdAt))
      .limit(FEED_LIMIT);

    const activity: ActivityItem[] = [
      ...recentStamps.map((r) => ({
        id: `stamp:${r.id}`,
        kind: "stamp" as const,
        at: r.at.toISOString(),
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        currentStamps: r.currentStamps,
        stampsRequired: r.stampsRequired,
        rewardText: null,
      })),
      ...recentRedeems.map((r) => ({
        id: `redeem:${r.id}`,
        kind: "redeem" as const,
        at: r.at.toISOString(),
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        currentStamps: null,
        stampsRequired: null,
        rewardText: r.rewardText,
      })),
      ...recentJoins.map((r) => ({
        id: `join:${r.id}`,
        kind: "join" as const,
        at: r.at.toISOString(),
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        currentStamps: r.currentStamps,
        stampsRequired: r.stampsRequired,
        rewardText: null,
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, FEED_LIMIT);

    const top = await db
      .select({
        customerId: customers.id,
        name: customers.name,
        email: customers.email,
        visits: sql<number>`count(${loyaltyProgressEvents.id})::int`,
      })
      .from(customers)
      .innerJoin(enrollments, eq(enrollments.customerId, customers.id))
      .innerJoin(
        loyaltyProgressEvents,
        and(eq(loyaltyProgressEvents.enrollmentId, enrollments.id), eq(loyaltyProgressEvents.source, "staff_scan")),
      )
      .groupBy(customers.id, customers.name, customers.email)
      .orderBy(desc(sql`count(${loyaltyProgressEvents.id})`))
      .limit(TOP_REGULARS);

    return {
      merchantId,
      merchantName: merchant?.name ?? "",
      range,
      customers: {
        total: Number(cust?.total ?? 0),
        value: Number(cust?.value ?? 0),
        previous: Number(cust?.previous ?? 0),
      },
      stampsIssued: { value: Number(stamps?.value ?? 0), previous: Number(stamps?.previous ?? 0) },
      rewardsRedeemed: {
        value: Number(redeemed?.value ?? 0),
        previous: Number(redeemed?.previous ?? 0),
      },
      repeatRate: {
        value: pct(Number(cohort?.returned ?? 0), Number(cohort?.with_visits ?? 0)),
        previous: pct(Number(cohort?.prev_returned ?? 0), Number(cohort?.prev_with_visits ?? 0)),
      },
      actions: {
        rewardReady: Number(ready?.n ?? 0),
        atRisk: Number(cohort?.at_risk ?? 0),
        atRiskDays: AT_RISK_DAYS,
      },
      series: {
        bucket: weekly ? "week" : "day",
        points: seriesRows.map((p) => ({ date: p.date, stamps: Number(p.stamps) })),
      },
      ladder: {
        joined: Number(cohort?.joined ?? 0),
        returned: Number(cohort?.returned ?? 0),
        regulars: Number(cohort?.regulars ?? 0),
        earnedReward: Number(cohort?.earned_reward ?? 0),
      },
      activity,
      topRegulars: top.map((t) => ({
        customerId: t.customerId,
        name: t.name,
        email: t.email,
        visits: Number(t.visits),
      })),
    };
  });
}

/** Whole-percent share, guarding the empty-shop case (0 of 0 is 0%, not NaN). */
function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
