import type { CSSProperties } from "react";
import { m } from "motion/react";
import type { ShopPreview } from "./api";
import { CardFoot, CardTop, merchantStyle } from "./MerchantCard";
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
      className="sf-aura sf-aura--tint qrew-card aspect-auto"
      style={merchantStyle(preview.brandColor)}
    >
      <CardTop name={preview.merchantName} program={preview.programName} count={filled} total={total} />

      <ol
        className="sf-steps qrew-stamps"
        style={{ "--cols": Math.min(total, 5) } as CSSProperties}
        aria-label={`${filled} of ${total} stamps`}
      >
        {cells.map((on, i) => (
          <m.li
            key={i}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.04, type: "spring", stiffness: 420, damping: 24 }}
            className={cn("sf-steps__dot", on && "sf-steps__dot--done")}
          >
            {on ? preview.stampIcon : ""}
          </m.li>
        ))}
      </ol>

      <CardFoot>
        <span className="sf-tag">
          {filled > 0 ? `Start with ${filled} stamp${filled === 1 ? "" : "s"}` : `Collect ${total}`}
        </span>
        <span className="sf-tag">{preview.rewardText}</span>
      </CardFoot>
    </m.div>
  );
}
