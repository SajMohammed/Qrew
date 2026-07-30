/** Shared display helpers. Kept in one place so a customer is labelled identically everywhere. */

/** Compact relative time — "2m ago", "3d ago". Long enough ago and the date is more useful. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * What to call someone. A walk-in gives no details at all, so say "Walk-in" rather than inventing a
 * name — the row is still real and still countable.
 */
export function displayName(customer: {
  name: string | null;
  email: string | null;
  phone?: string | null;
}): string {
  return customer.name || customer.email || customer.phone || "Walk-in";
}

/** The letter for an avatar chip. Falls back to a dot rather than an empty circle. */
export function initial(label: string): string {
  const ch = label.trim()[0];
  return ch ? ch.toUpperCase() : "·";
}

/**
 * Percent change against the previous window. Returns null when there's no baseline — going from
 * zero to anything is not "+∞%", it's simply new, and the UI says so instead.
 */
export function percentChange(value: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((value - previous) / previous) * 100);
}

/** Group separators make four- and five-figure counts readable at a glance. */
export function formatCount(n: number): string {
  return n.toLocaleString();
}

const STATUS_LABELS = {
  reward_ready: "Reward ready",
  at_risk: "At risk",
  regular: "Regular",
  new: "New",
  active: "Active",
} as const;

export function statusLabel(status: keyof typeof STATUS_LABELS): string {
  return STATUS_LABELS[status];
}
