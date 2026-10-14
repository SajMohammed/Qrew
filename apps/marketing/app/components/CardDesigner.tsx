"use client";

import { useState, type CSSProperties } from "react";

/** The shop colours Qrew's own card designer offers first. */
const COLOURS = [
  { name: "Espresso", hex: "#8a4b2f" },
  { name: "Forest", hex: "#146a2e" },
  { name: "Plum", hex: "#6c2a4b" },
  { name: "Ocean", hex: "#1f5673" },
  { name: "Brick", hex: "#b0413e" },
  { name: "Sand", hex: "#e8c9a0" },
];

/** White or dark text on a brand colour — the same rule the customer app uses. */
function textOn(hex: string): string {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.62 ? "#1c1a15" : "#fbfbf7";
}

/** "Cards that look like you": pick a colour and the card becomes yours. */
export function CardDesigner() {
  const [colour, setColour] = useState(COLOURS[0]!);
  return (
    <div className="mk-designer">
      <div className="mk-designer__swatches" role="group" aria-label="Card colour">
        {COLOURS.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="mk-swatch"
            style={{ "--c": c.hex } as CSSProperties}
            aria-label={c.name}
            aria-pressed={c.hex === colour.hex}
            onClick={() => setColour(c)}
          />
        ))}
      </div>
      <article
        className="sf-aura sf-aura--tint qrew-card mk-designer__card"
        style={{ "--card-color": colour.hex, "--card-ink": textOn(colour.hex) } as CSSProperties}
        aria-label={`A stamp card in ${colour.name}`}
      >
        <div className="qrew-card__top">
          <div className="qrew-card__shop">
            <span className="qrew-card__logo">Y</span>
            <div>
              <p className="qrew-card__name">Your shop</p>
              <p className="qrew-card__program">{colour.name}</p>
            </div>
          </div>
          <p className="sf-figure sf-figure-lg">
            4<span className="sf-figure__sup">/10</span>
          </p>
        </div>
        <ol className="sf-steps" style={{ "--dot": "16px", justifyContent: "space-between" } as CSSProperties} aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className={`sf-steps__dot${i < 4 ? " sf-steps__dot--done" : ""}`} />
          ))}
        </ol>
        <div className="qrew-card__foot">
          <span className="sf-tag">6 to your reward</span>
        </div>
      </article>
    </div>
  );
}
