import type { Program } from "@/api";
import { cn } from "@/lib/utils";
import { LiquidDrop } from "@/components/LiquidDrop";

/**
 * Which of the shop's cards a screen is about. Only ever drawn when the shop runs two or more: with
 * one card there is nothing to choose, and every screen looks as it always has.
 *
 * A segmented control that sets a value (buttons with aria-pressed), like the period tabs. `all`
 * adds a first option for the whole shop, as a `null` value — for the screens that can sum cards.
 */
export function CardSwitcher({
  cards,
  value,
  onChange,
  all,
  className,
}: {
  cards: Program[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** The label of a whole-shop option, when the screen has one. */
  all?: string;
  className?: string;
}) {
  const options: { id: string | null; label: string }[] = [
    ...(all ? [{ id: null, label: all }] : []),
    ...cards.map((c) => ({ id: c.id, label: c.name })),
  ];
  return (
    <div className={cn("sf-tabs sf-tabs--liquid", className)} role="group" aria-label="Card">
      <LiquidDrop watch={value} />
      {options.map((o) => (
        <button
          key={o.id ?? "all"}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className="sf-tabs__tab"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The cards a page shows: those that are on. A frozen card appears only in Settings. */
export function runningCards(programs: Program[] | null): Program[] {
  return (programs ?? []).filter((p) => p.status === "active");
}
