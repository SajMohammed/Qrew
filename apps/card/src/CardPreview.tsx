import type { CSSProperties } from "react";
import { m } from "motion/react";
import type { ShopPreview } from "./api";
import { textOn } from "./contrast";
import { cn } from "@/lib/utils";

// The card front, rendered from the public shop preview (no serial/QR) — shows the customer exactly
// what they'll get before they tap "Get this shop's card", including the bonus-stamp head start.
export function CardPreview({ preview }: { preview: ShopPreview }) {
  const total = preview.stampsRequired;
  const filled = Math.min(Math.max(preview.bonusStamps, 0), total); // endowed-progress head start
  const cells = Array.from({ length: total }, (_, i) => i < filled);

  return (
    <m.div
      initial={{ opacity: 0, y: 16, rotate: -1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="stampcard relative overflow-hidden rounded-3xl px-5 pt-5 pb-4"
      style={
        {
          "--card-color": preview.brandColor,
          "--card-ink": textOn(preview.brandColor),
        } as CSSProperties
      }
    >
      <div className="relative z-10 flex items-center gap-3">
        <span className="on-card-soft grid size-10 shrink-0 place-items-center rounded-full font-extrabold">
          {preview.merchantName.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold">{preview.merchantName}</span>
          <span className="block truncate text-[12.5px] opacity-75">{preview.programName}</span>
        </span>
        <span className="text-xl font-extrabold">
          {filled}
          <span className="text-sm opacity-70">/{total}</span>
        </span>
      </div>

      <div
        className="relative z-10 my-5 grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${Math.min(total, 5)}, minmax(0, 1fr))` }}
      >
        {cells.map((on, i) => (
          <m.span
            key={i}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.04, type: "spring", stiffness: 420, damping: 24 }}
            className={cn(
              "grid aspect-square place-items-center rounded-full text-base",
              on
                ? "bg-white text-[var(--card-color)] shadow-[0_3px_10px_rgba(0,0,0,0.25)]"
                : "on-card-line border-[1.5px] border-dashed",
            )}
          >
            {on ? preview.stampIcon : ""}
          </m.span>
        ))}
      </div>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold">
          {filled > 0 ? `Start with ${filled} stamp${filled === 1 ? "" : "s"}` : `Collect ${total}`}
        </span>
        <span className="on-card-soft rounded-full px-3 py-1 text-[11.5px] font-semibold">
          {preview.rewardText}
        </span>
      </div>
    </m.div>
  );
}
