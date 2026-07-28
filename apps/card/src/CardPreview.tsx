import type { CSSProperties } from "react";
import type { ShopPreview } from "./api";
import { textOn } from "./contrast";

// The card front, rendered from the public shop preview (no serial/QR) — shows the customer exactly
// what they'll get before they tap "Get this shop's card", including the bonus-stamp head start.
export function CardPreview({ preview }: { preview: ShopPreview }) {
  const total = preview.stampsRequired;
  const filled = Math.min(Math.max(preview.bonusStamps, 0), total); // endowed-progress head start
  const cells = Array.from({ length: total }, (_, i) => i < filled);

  return (
    <div
      className="stampcard preview"
      style={{ "--card-color": preview.brandColor, "--card-ink": textOn(preview.brandColor) } as CSSProperties}
    >
      <div className="sc-top">
        <div className="sc-logo">{preview.merchantName.charAt(0)}</div>
        <div className="sc-id">
          <div className="sc-name">{preview.merchantName}</div>
          <div className="sc-sub">{preview.programName}</div>
        </div>
        <div className="sc-count">
          {filled}
          <span>/{total}</span>
        </div>
      </div>

      <div className="stamp-grid" style={{ "--cols": Math.min(total, 5) } as CSSProperties}>
        {cells.map((on, i) => (
          <span key={i} className={`stamp${on ? " on" : ""}`}>
            {on ? preview.stampIcon : ""}
          </span>
        ))}
      </div>

      <div className="sc-foot">
        <span className="sc-reward">
          {filled > 0 ? `Start with ${filled} stamp${filled === 1 ? "" : "s"}` : `Collect ${total}`}
        </span>
        <span className="sc-pill">{preview.rewardText}</span>
      </div>
    </div>
  );
}
