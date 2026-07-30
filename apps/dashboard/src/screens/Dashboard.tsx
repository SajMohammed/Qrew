import { ArrowRight, Gift, TrendingDown, TrendingUp, Hourglass, RefreshCw } from "lucide-react";
import type { Analytics, AnalyticsRange, ActivityItem } from "@/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { displayName, formatCount, percentChange, relativeTime } from "@/lib/format";
import { Greeting } from "@/components/Greeting";

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

interface Props {
  data: Analytics | null;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  onRefresh: () => void;
  onViewCustomers: (filter: "at_risk" | "reward_ready") => void;
  loading: boolean;
}

export function Dashboard({
  data,
  range,
  onRangeChange,
  onRefresh,
  onViewCustomers,
  loading,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <Greeting data={data} />
        <div className="flex items-center gap-2">
          <div className="border-border bg-card inline-flex rounded-xl border p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRangeChange(r.id)}
                aria-pressed={range === r.id}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition sm:px-3",
                  range === r.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
            className="border-border bg-card text-muted-foreground hover:text-foreground grid size-10 place-items-center rounded-xl border transition disabled:opacity-50"
          >
            <RefreshCw className={cn("size-[18px]", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      {!data ? (
        <LoadingState />
      ) : data.customers.total === 0 ? (
        <EmptyShop />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Customers"
              value={data.customers.total}
              foot={
                data.customers.value > 0 ? (
                  <>
                    <Delta direction="up" text={`+${data.customers.value}`} /> joined this period
                  </>
                ) : (
                  <span className="text-faint">No new customers this period</span>
                )
              }
            />
            <Kpi
              label="Stamps issued"
              value={data.stampsIssued.value}
              foot={<Change value={data.stampsIssued.value} previous={data.stampsIssued.previous} />}
            />
            <Kpi
              label="Rewards redeemed"
              value={data.rewardsRedeemed.value}
              foot={
                <Change value={data.rewardsRedeemed.value} previous={data.rewardsRedeemed.previous} />
              }
            />
            <Kpi
              label="Repeat rate"
              value={data.repeatRate.value}
              suffix="%"
              accent
              foot={
                data.repeatRate.previous > 0 ? (
                  <>
                    <Delta
                      direction={data.repeatRate.value >= data.repeatRate.previous ? "up" : "down"}
                      text={`${data.repeatRate.value >= data.repeatRate.previous ? "+" : ""}${
                        data.repeatRate.value - data.repeatRate.previous
                      }%`}
                    />{" "}
                    come back again
                  </>
                ) : (
                  <span className="text-faint">of visitors return</span>
                )
              }
            />
          </section>

          {(data.actions.rewardReady > 0 || data.actions.atRisk > 0) && (
            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.actions.rewardReady > 0 && (
                <ActionCard
                  tone="ready"
                  icon={<Gift className="size-5" aria-hidden />}
                  count={data.actions.rewardReady}
                  text={
                    <>
                      <b className="text-foreground">
                        {data.actions.rewardReady === 1 ? "customer can" : "customers can"} redeem
                      </b>{" "}
                      a reward right now
                    </>
                  }
                  cta="See who"
                  onClick={() => onViewCustomers("reward_ready")}
                />
              )}
              {data.actions.atRisk > 0 && (
                <ActionCard
                  tone="risk"
                  icon={<Hourglass className="size-5" aria-hidden />}
                  count={data.actions.atRisk}
                  text={
                    <>
                      <b className="text-foreground">at risk</b> — no visit in{" "}
                      {data.actions.atRiskDays}+ days
                    </>
                  }
                  cta="Win back"
                  onClick={() => onViewCustomers("at_risk")}
                />
              )}
            </section>
          )}

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
            <Panel
              title="Stamp activity"
              caption={`Stamps issued per ${data.series.bucket} · last ${range.replace("d", " days")}`}
            >
              <StampChart points={data.series.points} bucket={data.series.bucket} />
            </Panel>

            <Panel title="Retention ladder" caption="How far customers climb">
              <div className="flex flex-col gap-2.5">
                <Rung
                  label="Joined"
                  sub="took a card"
                  value={data.ladder.joined}
                  total={data.ladder.joined}
                  color="var(--chart-4)"
                />
                <Rung
                  label="Returned"
                  sub="2+ visits"
                  value={data.ladder.returned}
                  total={data.ladder.joined}
                  color="var(--chart-3)"
                />
                <Rung
                  label="Regulars"
                  sub="5+ visits"
                  value={data.ladder.regulars}
                  total={data.ladder.joined}
                  color="var(--chart-2)"
                />
                <Rung
                  label="Earned reward"
                  sub="redeemed at least once"
                  value={data.ladder.earnedReward}
                  total={data.ladder.joined}
                  color="var(--chart-1)"
                />
              </div>
            </Panel>
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
            <Panel title="Recent activity" caption="Live at the counter">
              {data.activity.length === 0 ? (
                <Nothing>No activity yet.</Nothing>
              ) : (
                <ul className="flex flex-col">
                  {data.activity.map((item) => (
                    <FeedRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Top regulars" caption="Your most loyal customers">
              {data.topRegulars.length === 0 ? (
                <Nothing>Nobody has visited yet.</Nothing>
              ) : (
                <ol className="flex flex-col gap-3">
                  {data.topRegulars.map((r, i) => {
                    const best = data.topRegulars[0]?.visits ?? 1;
                    return (
                      <li key={r.customerId} className="grid grid-cols-[26px_1fr_auto] items-center gap-2.5">
                        <span className="bg-muted text-primary grid size-[26px] place-items-center rounded-lg font-mono text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="truncate text-sm font-semibold">{displayName(r)}</span>
                        <span className="text-muted-foreground tabular font-mono text-xs">
                          {r.visits}
                        </span>
                        <div className="bg-muted col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full bg-[var(--chart-3)]"
                            style={{ width: `${Math.max(4, (r.visits / Math.max(best, 1)) * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  foot,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  foot: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={cn(
        "gap-2 p-4",
        accent && "border-lime-deep/50 bg-linear-[155deg,color-mix(in_srgb,var(--lime)_28%,var(--card)),var(--card)]",
      )}
    >
      <p className="text-faint font-mono text-[10.5px] tracking-[0.1em] uppercase">{label}</p>
      <p
        className={cn(
          "tabular text-4xl leading-none font-extrabold tracking-tight",
          accent && "text-primary",
        )}
      >
        {formatCount(value)}
        {suffix}
      </p>
      <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">{foot}</p>
    </Card>
  );
}

/** A period-over-period change, or an honest "new" when there's no baseline to compare against. */
function Change({ value, previous }: { value: number; previous: number }) {
  const pct = percentChange(value, previous);
  if (pct === null) {
    return <span className="text-faint">{value > 0 ? "First activity in this window" : "No activity yet"}</span>;
  }
  return (
    <>
      <Delta direction={pct >= 0 ? "up" : "down"} text={`${pct >= 0 ? "+" : ""}${pct}%`} /> vs previous
      period
    </>
  );
}

function Delta({ direction, text }: { direction: "up" | "down"; text: string }) {
  const Icon = direction === "up" ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold",
        direction === "up"
          ? "text-success bg-success/12"
          : "text-warning bg-warning/12",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {text}
    </span>
  );
}

function ActionCard({
  tone,
  icon,
  count,
  text,
  cta,
  onClick,
}: {
  tone: "ready" | "risk";
  icon: React.ReactNode;
  count: number;
  text: React.ReactNode;
  cta: string;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex-row items-center gap-3 p-4",
        tone === "ready" && "border-lime-deep/50 bg-lime/8",
      )}
    >
      <span className={cn("shrink-0", tone === "ready" ? "text-primary" : "text-warning")}>
        {icon}
      </span>
      <span className="tabular text-2xl font-extrabold">{count}</span>
      <span className="text-muted-foreground min-w-0 text-sm">{text}</span>
      <button
        type="button"
        onClick={onClick}
        className="text-primary ml-auto inline-flex shrink-0 items-center gap-1 text-[13px] font-bold hover:underline"
      >
        {cta}
        <ArrowRight className="size-3.5" aria-hidden />
      </button>
    </Card>
  );
}

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 p-4">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      <p className="text-faint mb-3.5 text-xs">{caption}</p>
      {children}
    </Card>
  );
}

/**
 * Stamps over time. One hue, magnitude only; the final bucket is highlighted because "now" is the
 * bucket the owner is actually asking about.
 */
function StampChart({
  points,
  bucket,
}: {
  points: { date: string; stamps: number }[];
  bucket: "day" | "week";
}) {
  const label = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  // Scale to the busiest bucket ourselves. Left to infer it, the chart flattened a 58-stamp day
  // into a few pixels; a quiet shop still deserves a readable shape, hence the floor of 1.
  const peak = Math.max(...points.map((p) => p.stamps), 1);

  const last = points.length - 1;
  const tick = (i: number) => i === 0 || i === last || i === Math.floor(last / 2);

  return (
    <figure className="m-0">
      <div className="flex h-[150px] items-end gap-[3px]" role="img"
        aria-label={`Stamps issued per ${bucket}. Peak ${peak} on ${points.find((p) => p.stamps === peak)?.date ?? ""}.`}
      >
        {points.map((p, i) => (
          <div key={p.date} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className={cn(
                "w-full max-w-[26px] rounded-t-md transition-[height] duration-500",
                i === last ? "bg-lime-deep" : "bg-[var(--chart-2)]",
                p.stamps === 0 && "bg-muted rounded-sm",
              )}
              style={{ height: p.stamps === 0 ? "2px" : `${Math.max((p.stamps / peak) * 100, 3)}%` }}
            />
            {/* Hover reveals the exact figure — a chart you can only estimate from is half a chart. */}
            <span className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-lg border px-2 py-1 text-[11px] font-semibold whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              {p.stamps} · {bucket === "week" ? "week of " : ""}
              {label(p.date)}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="text-faint mt-2 flex justify-between font-mono text-[10px]">
        {points.map((p, i) => (
          <span key={p.date} className="flex-1 text-center">
            {tick(i) ? label(p.date) : ""}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Rung({
  label,
  sub,
  value,
  total,
  color,
}: {
  label: string;
  sub: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(96px,118px)_1fr_auto] items-center gap-3">
      <div className="text-[13px] leading-tight font-semibold">
        {label}
        <span className="text-faint block text-[10.5px] font-medium">{sub}</span>
      </div>
      <div className="bg-muted h-6 overflow-hidden rounded-lg">
        <div
          className="h-full rounded-lg transition-[width] duration-500"
          style={{ width: `${Math.max(pct, 2)}%`, background: color }}
        />
      </div>
      <div className="tabular min-w-[52px] text-right font-mono text-sm font-bold">
        {value}
        {total > 0 && value !== total && (
          <span className="text-faint ml-1 text-[11px] font-medium">{pct}%</span>
        )}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: ActivityItem }) {
  const who = displayName({ name: item.customerName, email: item.customerEmail });
  const face = item.kind === "redeem" ? "🎁" : item.kind === "join" ? "✨" : "☕";
  return (
    <li className="border-border flex items-center gap-3 border-b py-2.5 last:border-b-0">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[10px] text-sm",
          item.kind === "redeem" ? "bg-lime/25" : item.kind === "stamp" ? "bg-primary/12" : "bg-muted",
        )}
        aria-hidden
      >
        {face}
      </span>
      <p className="min-w-0 text-[13px] leading-snug">
        <b className="font-bold">{who}</b>{" "}
        {item.kind === "redeem" ? (
          <>
            redeemed <b className="font-bold">{item.rewardText}</b>
          </>
        ) : item.kind === "join" ? (
          "took a card"
        ) : (
          <>
            earned a stamp
            {item.currentStamps !== null && item.stampsRequired !== null && (
              <span className="text-faint tabular">
                {" "}
                · {item.currentStamps}/{item.stampsRequired}
              </span>
            )}
          </>
        )}
      </p>
      <span className="text-faint ml-auto shrink-0 font-mono text-[11px]">
        {relativeTime(item.at)}
      </span>
    </li>
  );
}

function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-faint py-6 text-center text-sm">{children}</p>;
}

function EmptyShop() {
  return (
    <Card className="items-center gap-2 p-10 text-center">
      <span className="text-3xl" aria-hidden>
        ✨
      </span>
      <h2 className="text-lg font-bold">No customers yet</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        Print your Counter QR and put it by the till. As soon as someone takes a card, their visits,
        rewards and retention will show up here.
      </p>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[116px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-[228px] rounded-xl" />
        <Skeleton className="h-[228px] rounded-xl" />
      </div>
    </div>
  );
}
