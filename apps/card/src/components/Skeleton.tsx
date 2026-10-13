import { cn } from "@/lib/utils";

/** A quiet placeholder that holds the layout while real content is on its way. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("sf-skeleton", className)} aria-hidden />;
}

/** Matches the wallet's geometry — the leading card, then rows — so nothing jumps when they land. */
export function CardsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading your cards" aria-busy="true">
      <Skeleton className="aspect-[1.6] rounded-xl" />
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
    </div>
  );
}

/** The card and its QR panel, held in place while the card loads. */
export function CardDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading your card" aria-busy="true">
      <Skeleton className="h-[300px] rounded-xl" />
      <Skeleton className="h-[260px] rounded-lg" />
    </div>
  );
}
