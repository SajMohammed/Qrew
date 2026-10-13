import { m } from "motion/react";
import type { CardTile } from "./api";
import { textOn } from "./contrast";
import { CardFoot, CardTop, merchantStyle } from "./MerchantCard";
import { Icon } from "@/components/Icon";
import { buzz } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The wallet. One card leads — a reward that's ready, else the first — as the screen's one vivid
 * surface, in its shop's colour; the rest follow as rows, each with its shop's colour as a dot.
 * `lead={false}` lists them all as rows, for a screen whose vivid surface is something else.
 */
export function CardsGrid({
  cards,
  onOpen,
  lead = true,
}: {
  cards: CardTile[];
  onOpen: (serial: string) => void;
  lead?: boolean;
}) {
  const open = (serial: string) => {
    buzz(8);
    onOpen(serial);
  };
  const first = lead ? (cards.find((c) => c.rewardReady) ?? cards[0]) : undefined;
  const rest = cards.filter((c) => c !== first);

  return (
    <div className="flex flex-col gap-6">
      {first?.rewardReady && (
        <div className="sf-banner" role="status">
          <span className="sf-bubble sf-bubble--sm" aria-hidden>
            <Icon name="gift" />
          </span>
          <div className="sf-banner__main">
            <p className="sf-banner__title">Reward ready</p>
            <p className="sf-banner__meta truncate">{first.merchantName}</p>
          </div>
          <button type="button" onClick={() => open(first.serial)} className="sf-btn sf-btn--ink">
            Show
          </button>
        </div>
      )}

      {first && (
        <m.button
          type="button"
          onClick={() => open(first.serial)}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          whileTap={{ scale: 0.97 }}
          style={merchantStyle(first.brandColor)}
          className={cn("sf-aura sf-aura--tint qrew-card w-full text-left", first.rewardReady && "qrew-card--ready")}
        >
          <CardTop name={first.merchantName} count={first.currentStamps} total={first.stampsRequired} />
          <ol className="sf-steps [--dot:14px] sm:[--dot:18px]" aria-hidden>
            {Array.from({ length: first.stampsRequired }, (_, i) => (
              <li key={i} className={cn("sf-steps__dot", i < first.currentStamps && "sf-steps__dot--done")} />
            ))}
          </ol>
          <CardFoot>
            <span className="sf-tag">
              {first.rewardReady
                ? "Reward ready"
                : `${Math.max(0, first.stampsRequired - first.currentStamps)} to your reward`}
            </span>
          </CardFoot>
        </m.button>
      )}

      {rest.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={first ? "More cards" : undefined}>
          {first && (
            <div className="sf-spread">
              <h2 className="sf-heading m-0">More cards</h2>
              <span className="sf-count">{rest.length}</span>
            </div>
          )}
          <ul className="sf-rows sf-rows--wells">
            {rest.map((c, i) => (
              <li key={c.serial}>
                <m.button
                  type="button"
                  onClick={() => open(c.serial)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32, delay: (i + 1) * 0.05 }}
                  className="sf-row sf-row--well sf-press w-full text-left"
                >
                  {/* The shop's colour, as the shop chose it. */}
                  <span className="sf-avatar" style={{ background: c.brandColor, color: textOn(c.brandColor) }}>
                    {c.merchantName.charAt(0)}
                  </span>
                  <span className="sf-row__main">
                    <span className="sf-row__title">{c.merchantName}</span>
                    <span className="sf-row__meta">
                      {c.rewardReady ? "Reward ready" : `${c.currentStamps} of ${c.stampsRequired} stamps`}
                    </span>
                  </span>
                  <span className="sf-row__trail">
                    {c.rewardReady ? (
                      <span className="sf-status sf-status--positive">Ready</span>
                    ) : (
                      <Icon name="chevronRight" className="size-5" />
                    )}
                  </span>
                </m.button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
