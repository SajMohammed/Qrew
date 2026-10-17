import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Gift, Hourglass, RefreshCw, Repeat, Sparkles, Stamp, Users } from "lucide-react";
import type { Analytics, AnalyticsRange, ActivityItem, Program } from "@/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { displayName, formatCount, percentChange, relativeTime } from "@/lib/format";
import { Greeting } from "@/components/Greeting";
import { LiquidDrop } from "@/components/LiquidDrop";
import { CardSwitcher } from "@/components/CardSwitcher";

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

interface Props {
  data: Analytics | null;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  /** The shop's cards that are on. With two or more, the overview can be read for one of them. */
  cards: Program[];
  /** The card the numbers are for; null for the whole shop. */
  card: string | null;
  onCardChange: (card: string | null) => void;
  onRefresh: () => void;
  onViewCustomers: (filter: "at_risk" | "reward_ready") => void;
  loading: boolean;
}

/**
 * The overview, as a Softform bento. Its one vivid surface is whatever needs the owner now — rewards
 * waiting, regulars going quiet — so the eye starts there; when nothing does, nothing is vivid.
 */
export function Dashboard({
  data,
  range,
  onRangeChange,
  cards,
  card,
  onCardChange,
  onRefresh,
  onViewCustomers,
  loading,
}: Props) {
  const needs = Boolean(data && (data.actions.rewardReady > 0 || data.actions.atRisk > 0));
  // With the aura in the first slot the tiles go 2×2 beside it; without, four across.
  const tile = needs ? "sf-span-4" : "sf-span-3";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Greeting data={data} />
        <div className="flex items-center gap-2">
          <div className="sf-tabs sf-tabs--liquid" role="group" aria-label="Period">
            <LiquidDrop watch={range} />
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRangeChange(r.id)}
                aria-pressed={range === r.id}
                className="sf-tabs__tab"
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
            className="sf-bubble sf-bubble--raised disabled:opacity-50"
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </header>

      {cards.length >= 2 && (
        <CardSwitcher cards={cards} value={card} onChange={onCardChange} all="All cards" className="-mt-4" />
      )}

      {!data ? (
        <LoadingState />
      ) : data.customers.total === 0 ? (
        <EmptyShop />
      ) : (
        <>
          <section className="sf-bento">
            {needs && <NeedsYou actions={data.actions} onViewCustomers={onViewCustomers} />}
            <MetricTile
              className={tile}
              label="Customers"
              icon={<Users />}
              value={formatCount(data.customers.total)}
              sup={data.customers.value > 0 ? { text: `+${data.customers.value}`, up: true } : undefined}
              note={data.customers.value > 0 ? "joined this period" : "No new customers this period"}
            />
            <MetricTile
              className={tile}
              label="Stamps issued"
              icon={<Stamp />}
              value={formatCount(data.stampsIssued.value)}
              {...change(data.stampsIssued.value, data.stampsIssued.previous)}
              chart={<StampSpark points={data.series.points} bucket={data.series.bucket} />}
            />
            <MetricTile
              className={tile}
              label="Rewards redeemed"
              icon={<Gift />}
              value={formatCount(data.rewardsRedeemed.value)}
              {...change(data.rewardsRedeemed.value, data.rewardsRedeemed.previous)}
            />
            <RepeatTile className={tile} rate={data.repeatRate} />
          </section>

          <section className="sf-bento">
            <Panel
              className="sf-span-8"
              title="Stamp activity"
              caption={`Stamps issued per ${data.series.bucket} · last ${range.replace("d", " days")}`}
              aside={<Peak points={data.series.points} />}
            >
              <StampChart points={data.series.points} bucket={data.series.bucket} />
            </Panel>

            <Panel className="sf-span-4" title="Retention ladder" caption="How far customers climb">
              <div className="flex flex-col gap-3">
                <Rung label="Joined" sub="took a card" value={data.ladder.joined} total={data.ladder.joined} />
                <Rung label="Returned" sub="2+ visits" value={data.ladder.returned} total={data.ladder.joined} />
                <Rung label="Regulars" sub="5+ visits" value={data.ladder.regulars} total={data.ladder.joined} />
                <Rung
                  label="Earned reward"
                  sub="redeemed at least once"
                  value={data.ladder.earnedReward}
                  total={data.ladder.joined}
                />
              </div>
            </Panel>
          </section>

          <section className="sf-bento">
            <Panel className="sf-span-8" title="Recent activity" caption="Live at the counter">
              {data.activity.length === 0 ? (
                <Nothing>No activity yet.</Nothing>
              ) : (
                <ul className="sf-rows">
                  {data.activity.map((item) => (
                    <FeedRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel className="sf-span-4" title="Top regulars" caption="Your most loyal customers">
              {data.topRegulars.length === 0 ? (
                <Nothing>Nobody has visited yet.</Nothing>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {data.topRegulars.map((r, i) => {
                    const best = data.topRegulars[0]?.visits ?? 1;
                    return (
                      <li key={r.customerId} className="grid grid-cols-[28px_1fr_auto] items-center gap-x-3 gap-y-1.5">
                        <span className="sf-count min-w-7 px-0">{i + 1}</span>
                        <span className="truncate text-sm">{displayName(r)}</span>
                        <span className="tabular text-ink-2 text-sm">{r.visits}</span>
                        <div
                          className="sf-progress sf-progress--ink col-start-2 col-end-4 h-2"
                          style={{ "--value": `${Math.max(4, (r.visits / Math.max(best, 1)) * 100)}%` } as CSSProperties}
                          aria-hidden
                        >
                          <div className="sf-progress__bar" />
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

/** The aura: what needs the owner now. White words stay in its deep top zone; actions sit on light glass. */
function NeedsYou({
  actions,
  onViewCustomers,
}: {
  actions: Analytics["actions"];
  onViewCustomers: Props["onViewCustomers"];
}) {
  return (
    <article className="sf-aura sf-span-4 sf-row-2">
      <div className="sf-aura__top">
        <span className="text-sm">Needs you now</span>
        <span className="sf-bubble sf-bubble--glass pointer-events-none" aria-hidden>
          <Sparkles />
        </span>
      </div>
      <h2 className="sf-title sf-twotone">
        {actions.rewardReady > 0 ? (
          <>
            <span className="sf-lead">
              {actions.rewardReady} {actions.rewardReady === 1 ? "customer can" : "customers can"}
            </span>{" "}
            <strong>redeem a reward right now</strong>
          </>
        ) : (
          <>
            <span className="sf-lead">{actions.atRisk}</span> <strong>at risk</strong>
          </>
        )}
      </h2>
      <div className="mt-auto flex flex-col gap-2">
        {actions.rewardReady > 0 && (
          <Insight
            icon={<Gift />}
            title={`${actions.rewardReady} ${actions.rewardReady === 1 ? "reward" : "rewards"} ready`}
            text="Customers who can redeem right now"
            cta="See who"
            onClick={() => onViewCustomers("reward_ready")}
          />
        )}
        {actions.atRisk > 0 && (
          <Insight
            icon={<Hourglass />}
            title={`${actions.atRisk} at risk`}
            text={`No visit in ${actions.atRiskDays}+ days`}
            cta="Win back"
            onClick={() => onViewCustomers("at_risk")}
          />
        )}
      </div>
    </article>
  );
}

function Insight({
  icon,
  title,
  text,
  cta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="sf-glass sf-glass--light sf-insight">
      <span className="sf-bubble sf-bubble--sm pointer-events-none bg-paper text-on-pastel" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="sf-insight__title">{title}</p>
        <p className="sf-insight__text">{text}</p>
      </div>
      <button type="button" onClick={onClick} className="sf-btn sf-btn--ink px-4">
        {cta}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** A period-over-period change as the figure's superscript, or an honest note when there's no baseline. */
function change(value: number, previous: number): { sup?: { text: string; up: boolean }; note: string } {
  const pct = percentChange(value, previous);
  if (pct === null) return { note: value > 0 ? "First activity in this window" : "No activity yet" };
  return { sup: { text: `${pct >= 0 ? "+" : ""}${pct}%`, up: pct >= 0 }, note: "vs previous period" };
}

/** One number per card: label and icon bubble on top, the figure, then a micro-chart and the change. */
function MetricTile({
  className,
  label,
  icon,
  value,
  sup,
  note,
  chart,
}: {
  className: string;
  label: string;
  icon: ReactNode;
  value: string;
  sup?: { text: string; up: boolean };
  note: string;
  chart?: ReactNode;
}) {
  return (
    <article className={cn("sf-card sf-metric", className)}>
      <div className="sf-card__head">
        <p className="sf-card__label">{label}</p>
        <span className="sf-bubble pointer-events-none" aria-hidden>
          {icon}
        </span>
      </div>
      <p className="sf-figure sf-figure-lg">
        {value}
        {sup && (
          <span className={cn("sf-figure__sup", sup.up ? "sf-figure__sup--up" : "sf-figure__sup--down")}>
            {sup.text}
          </span>
        )}
      </p>
      <div className="sf-card__foot">
        {chart}
        <span className="sf-metric__delta whitespace-normal">{note}</span>
      </div>
    </article>
  );
}

/** Repeat rate is a share of visitors, so it reads as a ring: the arc, a dashed remainder, the figure inside. */
function RepeatTile({ className, rate }: { className: string; rate: Analytics["repeatRate"] }) {
  const diff = rate.value - rate.previous;
  return (
    <article className={cn("sf-card sf-metric", className)}>
      <div className="sf-card__head">
        <p className="sf-card__label">Repeat rate</p>
        <span className="sf-bubble pointer-events-none" aria-hidden>
          <Repeat />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="sf-ring [--size:96px]" role="img" aria-label={`${rate.value} percent of visitors come back`}>
          <svg viewBox="0 0 116 116" aria-hidden>
            <circle className="sf-ring__track" cx="58" cy="58" r="54" />
            <circle
              className="sf-ring__arc"
              cx="58"
              cy="58"
              r="54"
              pathLength="100"
              strokeDasharray={`${Math.min(100, Math.max(0, rate.value))} 100`}
            />
          </svg>
          <div className="sf-ring__center">
            <span className="sf-figure sf-figure-sm">
              {rate.value}
              <span className="sf-figure__unit">%</span>
            </span>
          </div>
        </div>
        <span className="sf-metric__delta flex-col items-end gap-0.5 whitespace-normal text-right">
          {rate.previous > 0 ? (
            <>
              <span className={diff >= 0 ? "text-signature-ink" : "text-danger-ink"}>
                {diff >= 0 ? "+" : ""}
                {diff}%
              </span>
              come back again
            </>
          ) : (
            "of visitors return"
          )}
        </span>
      </div>
    </article>
  );
}

/** The stamp series as ticks: ink for each bucket, muted for empty ones, a lime marker on the latest. */
function StampSpark({ points, bucket }: { points: { date: string; stamps: number }[]; bucket: "day" | "week" }) {
  const shown = points.slice(-30);
  const peak = Math.max(...shown.map((p) => p.stamps), 1);
  const step = shown.length > 1 ? 128 / (shown.length - 1) : 0;
  const last = shown[shown.length - 1];
  const lastY = last ? 39 - Math.max((last.stamps / peak) * 34, 2) : 39;
  return (
    <svg
      className="sf-spark"
      viewBox="0 0 132 40"
      role="img"
      aria-label={`Stamps per ${bucket}${last ? `, ${last.stamps} in the latest` : ""}`}
    >
      <line className="sf-spark__base" x1="0" y1="39" x2="132" y2="39" />
      {shown.map((p, i) => {
        const x = 2 + i * step;
        const h = p.stamps === 0 ? 0 : Math.max((p.stamps / peak) * 34, 2);
        return (
          <line
            key={p.date}
            className={cn("sf-spark__tick", p.stamps === 0 && "sf-spark__tick--muted")}
            x1={x}
            y1="39"
            x2={x}
            y2={39 - Math.max(h, 1)}
          />
        );
      })}
      {last && <circle className="sf-spark__mark" cx={2 + (shown.length - 1) * step} cy={lastY} r="3.5" />}
    </svg>
  );
}

function Panel({
  className,
  title,
  caption,
  aside,
  children,
}: {
  className: string;
  title: string;
  caption: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={cn("sf-card", className)}>
      <div className="sf-card__head">
        <div>
          <h2 className="sf-heading m-0">{title}</h2>
          <p className="sf-card__meta">{caption}</p>
        </div>
        {aside}
      </div>
      {children}
    </article>
  );
}

/** The chart's busiest bucket, in words — a chart also states its number as text. */
function Peak({ points }: { points: { date: string; stamps: number }[] }) {
  const peak = points.reduce<{ date: string; stamps: number } | null>(
    (best, p) => (!best || p.stamps > best.stamps ? p : best),
    null,
  );
  if (!peak || peak.stamps === 0) return null;
  return (
    <p className="sf-kv shrink-0 text-right">
      Peak <b>{peak.stamps}</b> · {new Date(peak.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
    </p>
  );
}

/**
 * Stamps over time. Axis-less, quiet ticks; the final bucket carries the lime marker because "now" is
 * the bucket the owner is actually asking about.
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
      <div
        className="flex h-[160px] items-end gap-[3px] border-b border-line pb-px"
        role="img"
        aria-label={`Stamps issued per ${bucket}. Peak ${peak} on ${points.find((p) => p.stamps === peak)?.date ?? ""}.`}
      >
        {points.map((p, i) => (
          <div key={p.date} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className={cn(
                "w-full max-w-[10px] rounded-full transition-[height,background-color] duration-500",
                i === last
                  ? "bg-signature shadow-[inset_0_0_0_1.5px_var(--chart-ink)]"
                  : "bg-chart-muted group-hover:bg-chart-ink",
                p.stamps === 0 && "bg-transparent",
              )}
              style={{ height: p.stamps === 0 ? "0px" : `${Math.max((p.stamps / peak) * 100, 4)}%` }}
            />
            {/* Hover reveals the exact figure — a chart you can only estimate from is half a chart. */}
            <span
              className={cn(
                "sf-tooltip pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100",
                // Near either edge, anchor inward so the label never runs off a phone screen.
                i < points.length * 0.15 ? "left-0" : i > points.length * 0.85 ? "right-0" : "left-1/2 -translate-x-1/2",
              )}
            >
              {p.stamps} · {bucket === "week" ? "week of " : ""}
              {label(p.date)}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="text-ink-3 mt-2 flex justify-between text-[12px]">
        {points.map((p, i) => (
          <span key={p.date} className="flex-1 text-center">
            {tick(i) ? label(p.date) : ""}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Rung({ label, sub, value, total }: { label: string; sub: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(96px,118px)_1fr_auto] items-center gap-3">
      <div className="text-sm leading-tight">
        {label}
        <span className="text-ink-3 block text-[12px]">{sub}</span>
      </div>
      <div className="sf-progress sf-progress--ink" style={{ "--value": `${Math.max(pct, 2)}%` } as CSSProperties} aria-hidden>
        <div className="sf-progress__bar" />
      </div>
      <div className="tabular min-w-[52px] text-right text-sm font-medium">
        {value}
        {total > 0 && value !== total && <span className="text-ink-3 ml-1 text-[12px] font-normal">{pct}%</span>}
      </div>
    </div>
  );
}

const FEED = {
  stamp: { icon: Stamp, tint: "" },
  redeem: { icon: Gift, tint: "bg-signature-soft text-signature-ink" },
  join: { icon: Sparkles, tint: "bg-lavender-soft text-lavender-ink" },
} as const;

function FeedRow({ item }: { item: ActivityItem }) {
  const who = displayName({ name: item.customerName, email: item.customerEmail });
  const kind = FEED[item.kind];
  return (
    <li className="sf-row">
      <span className={cn("sf-bubble pointer-events-none", kind.tint)} aria-hidden>
        <kind.icon />
      </span>
      <p className="m-0 min-w-0 text-sm leading-snug">
        <b className="font-medium">{who}</b>{" "}
        {item.kind === "redeem" ? (
          <>
            redeemed <b className="font-medium">{item.rewardText}</b>
          </>
        ) : item.kind === "join" ? (
          "took a card"
        ) : (
          <>
            earned a stamp
            {item.currentStamps !== null && item.stampsRequired !== null && (
              <span className="text-ink-3 tabular">
                {" "}
                · {item.currentStamps}/{item.stampsRequired}
              </span>
            )}
          </>
        )}
      </p>
      <span className="sf-row__trail">{relativeTime(item.at)}</span>
    </li>
  );
}

function Nothing({ children }: { children: ReactNode }) {
  return <p className="text-ink-3 m-0 py-6 text-center text-sm">{children}</p>;
}

function EmptyShop() {
  return (
    <div className="sf-card">
      <div className="sf-empty">
        <span className="sf-bubble sf-bubble--lens sf-bubble--lg pointer-events-none" aria-hidden>
          <Sparkles />
        </span>
        <h2 className="sf-title sf-twotone">
          <span className="sf-lead">No customers</span> <strong>yet</strong>
        </h2>
        <p>
          Print your Counter QR and put it by the till. As soon as someone takes a card, their visits,
          rewards and retention will show up here.
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="sf-bento">
      <Skeleton className="sf-span-4 sf-row-2 min-h-[360px] rounded-xl" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="sf-span-4 h-[172px] rounded-lg" />
      ))}
      <Skeleton className="sf-span-8 h-[260px] rounded-lg" />
      <Skeleton className="sf-span-4 h-[260px] rounded-lg" />
    </div>
  );
}
