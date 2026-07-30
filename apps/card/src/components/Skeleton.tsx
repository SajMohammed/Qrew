import { cn } from "@/lib/utils";

/** A quiet placeholder that holds the layout while real content is on its way. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-panel animate-pulse rounded-xl", className)} aria-hidden />;
}

/** Matches the tile grid's geometry so nothing jumps when the cards land. */
export function CardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Loading your cards" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[124px] rounded-2xl" />
      ))}
    </div>
  );
}

/** The card-detail hero, held in place while the card loads. */
export function CardDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading your card" aria-busy="true">
      <Skeleton className="h-[420px] rounded-3xl" />
      <Skeleton className="h-11 rounded-xl" />
    </div>
  );
}
