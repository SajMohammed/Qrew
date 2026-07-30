import { useUser } from "@clerk/react";
import type { Analytics } from "@/api";

/**
 * The welcome line. Two things move independently:
 *   - the salutation follows the clock (and rotates through a few phrasings, picked per DAY so it
 *     doesn't reshuffle under the reader every time the 60s poll re-renders);
 *   - the sub-line is drawn from the shop's real numbers, most actionable first, so it earns its
 *     place at the top of the screen instead of just being decoration.
 */

type Slot = "morning" | "afternoon" | "evening" | "night";

const SALUTATIONS: Record<Slot, string[]> = {
  morning: ["Good morning", "Morning", "Rise and shine", "Up early"],
  afternoon: ["Good afternoon", "Afternoon", "Hey", "Hope it's busy"],
  evening: ["Good evening", "Evening", "Winding down", "Hey"],
  night: ["Still up", "Burning the midnight oil", "Late one", "Night owl"],
};

const EMOJI: Record<Slot, string> = {
  morning: "☕",
  afternoon: "👋",
  evening: "🌆",
  night: "🌙",
};

function slotFor(hour: number): Slot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Whole days since the epoch — stable within a day, different tomorrow. */
function dayIndex(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The single most useful thing to say about the shop right now. */
function subline(data: Analytics | null): string {
  if (!data) return "Fetching today's numbers…";

  if (data.customers.total === 0) {
    return "No cards out yet — your first customer is one QR scan away.";
  }
  if (data.actions.rewardReady > 0) {
    return `${plural(data.actions.rewardReady, "customer is", "customers are")} owed a reward. Go make someone's day.`;
  }
  if (data.actions.atRisk > 0) {
    return `${plural(data.actions.atRisk, "regular has", "regulars have")} gone quiet for ${data.actions.atRiskDays}+ days.`;
  }
  if (data.customers.value > 0) {
    return `${plural(data.customers.value, "new customer", "new customers")} joined this period — nice work.`;
  }
  if (data.stampsIssued.value > 0) {
    return `${plural(data.stampsIssued.value, "stamp", "stamps")} issued this period. The counter's been busy.`;
  }
  return "All quiet at the counter. A good moment to reprint the poster.";
}

export function Greeting({ data }: { data: Analytics | null }) {
  const { user } = useUser();

  // Clerk lets people sign up without a name, so fall back rather than greeting an empty string.
  const name =
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "there";

  const now = new Date();
  const slot = slotFor(now.getHours());
  const pool = SALUTATIONS[slot];
  const salutation = pool[dayIndex(now) % pool.length] ?? pool[0];

  return (
    <div className="min-w-0">
      <h1 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
        <span>
          {salutation}, <span className="text-primary">{name}</span>
        </span>
        <span aria-hidden className="text-xl sm:text-2xl">
          {EMOJI[slot]}
        </span>
      </h1>
      <p className="text-muted-foreground mt-1 text-sm sm:text-[15px]">{subline(data)}</p>
    </div>
  );
}
