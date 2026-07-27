import type { CSSProperties } from "react";
import type { CardTile } from "./api";
import { textOn } from "./contrast";

export function CardsGrid({ cards, onOpen }: { cards: CardTile[]; onOpen: (serial: string) => void }) {
  return (
    <div className="cards-grid">
      {cards.map((c) => {
        const pct = Math.min(100, Math.round((c.currentStamps / Math.max(1, c.stampsRequired)) * 100));
        return (
          <button
            key={c.serial}
            className={`tile${c.rewardReady ? " ready" : ""}`}
            style={{ "--tile": c.brandColor, "--tile-ink": textOn(c.brandColor) } as CSSProperties}
            onClick={() => onOpen(c.serial)}
          >
            <span className="tile-top">
              <span className="tile-logo">{c.merchantName.charAt(0)}</span>
              {c.rewardReady && <span className="tile-badge">🎉</span>}
            </span>
            <span className="tile-name">{c.merchantName}</span>
            <span className="tile-count">
              {c.rewardReady ? "Reward ready" : `${c.currentStamps}/${c.stampsRequired}`}
            </span>
            <span className="tile-bar">
              <span className="tile-fill" style={{ width: `${pct}%` }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
