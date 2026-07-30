import { useRef, useState, type ReactNode } from "react";
import { m } from "motion/react";
import { buzz } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const TRIGGER = 70; // px of pull before the gesture arms
const MAX = 110; // resistance ceiling, so the sheet can't be dragged arbitrarily far

/**
 * Pull down at the top of the list to refetch — the gesture people already expect from every other
 * card/wallet app. Only engages when the scroller is genuinely at the top, so it never fights a
 * normal scroll, and it buzzes once at the arming threshold rather than continuously.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  const begin = (e: React.TouchEvent) => {
    if (busy) return;
    // Only claim the gesture when there's nothing above us to scroll.
    if (window.scrollY > 0) return;
    startY.current = e.touches[0]?.clientY ?? null;
    armed.current = false;
  };

  const move = (e: React.TouchEvent) => {
    if (startY.current === null || busy) return;
    const y = e.touches[0]?.clientY ?? 0;
    const delta = y - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band: the further you pull, the less it gives.
    const eased = Math.min(MAX, delta * 0.5);
    setPull(eased);
    if (!armed.current && eased >= TRIGGER) {
      armed.current = true;
      buzz(10);
    }
  };

  const end = async () => {
    if (startY.current === null) return;
    const shouldRefresh = pull >= TRIGGER && !busy;
    startY.current = null;
    if (!shouldRefresh) {
      setPull(0);
      return;
    }
    setBusy(true);
    setPull(TRIGGER * 0.6);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
      setPull(0);
      armed.current = false;
    }
  };

  return (
    <div onTouchStart={begin} onTouchMove={move} onTouchEnd={() => void end()}>
      <m.div
        className="pointer-events-none flex items-center justify-center overflow-hidden"
        animate={{ height: pull }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
        initial={false}
      >
        <span
          className={cn(
            "text-faint size-6 rounded-full border-2 border-current border-t-transparent transition-opacity",
            busy && "animate-spin",
            pull > 8 ? "opacity-100" : "opacity-0",
          )}
          style={{ transform: busy ? undefined : `rotate(${pull * 3}deg)` }}
          aria-hidden
        />
      </m.div>
      {children}
    </div>
  );
}
