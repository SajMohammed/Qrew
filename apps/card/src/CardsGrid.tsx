import type { CSSProperties } from "react";
import { m } from "motion/react";
import type { CardTile } from "./api";
import { textOn } from "./contrast";
import { buzz } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The wallet. Each tile keeps its shop's brand colour — these are the merchants' cards, not Qrew's
 * — and they deal in on a stagger so the wallet feels like it's being laid out rather than pasted.
 */
export function CardsGrid({
  cards,
  onOpen,
}: {
  cards: CardTile[];
  onOpen: (serial: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((c, i) => {
        const pct = Math.min(
          100,
          Math.round((c.currentStamps / Math.max(1, c.stampsRequired)) * 100),
        );
        return (
          <m.button
            key={c.serial}
            type="button"
            onClick={() => {
              buzz(8);
              onOpen(c.serial);
            }}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 32, delay: i * 0.05 }}
            whileTap={{ scale: 0.96 }}
            style={
              { "--card-color": c.brandColor, "--card-ink": textOn(c.brandColor) } as CSSProperties
            }
            className={cn(
              "stampcard relative flex flex-col items-start gap-1 overflow-hidden rounded-2xl p-3.5 text-left",
              c.rewardReady && "ready",
            )}
          >
            <span className="relative z-10 flex w-full items-center">
              <span className="on-card-soft grid size-8 place-items-center rounded-full text-sm font-extrabold">
                {c.merchantName.charAt(0)}
              </span>
              {c.rewardReady && <span className="ml-auto text-base">🎉</span>}
            </span>
            <span className="relative z-10 mt-1 line-clamp-2 text-[13.5px] leading-tight font-extrabold">
              {c.merchantName}
            </span>
            <span className="relative z-10 text-[11.5px] font-semibold opacity-80">
              {c.rewardReady ? "Reward ready" : `${c.currentStamps}/${c.stampsRequired}`}
            </span>
            <span className="on-card-soft relative z-10 mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
              <m.span
                className="block h-full rounded-full bg-white/90"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 30, delay: 0.15 + i * 0.05 }}
              />
            </span>
          </m.button>
        );
      })}
    </div>
  );
}
