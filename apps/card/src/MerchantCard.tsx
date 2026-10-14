import type { CSSProperties, ReactNode } from "react";
import { textOn } from "./contrast";

/*
 * The pieces every merchant card shares. The card is the SHOP's: a Softform tinted aura
 * (`.sf-aura.sf-aura--tint.qrew-card`) grown from their brand colour, with the ink textOn() picks
 * for it. It never reads Qrew's signature tokens.
 */

/** The shop's colour and the ink that reads on it, as the custom properties `.qrew-card` takes. */
export function merchantStyle(brandColor: string, extra?: Record<string, string | number>): CSSProperties {
  return { "--card-color": brandColor, "--card-ink": textOn(brandColor), ...extra } as CSSProperties;
}

/** Initial, name and programme on the left; the stamp count, the card's loud number, on the right. */
export function CardTop({
  name,
  program,
  count,
  total,
  heading,
}: {
  name: string;
  program?: string;
  count: number;
  total: number;
  /** The open card names the screen, so its shop name is the page's heading. */
  heading?: boolean;
}) {
  const Name = heading ? "h1" : "p";
  return (
    <div className="qrew-card__top">
      <div className="qrew-card__shop">
        <span className="qrew-card__logo">{name.charAt(0)}</span>
        <div className="min-w-0">
          <Name className="qrew-card__name truncate">{name}</Name>
          {program && <p className="qrew-card__program truncate">{program}</p>}
        </div>
      </div>
      <p className="sf-figure sf-figure-xl shrink-0">
        {count}
        <span className="sf-figure__sup">/{total}</span>
      </p>
    </div>
  );
}

/** The card's foot: its words on light glass tags, which read on any brand colour. */
export function CardFoot({ children }: { children: ReactNode }) {
  return <div className="qrew-card__foot">{children}</div>;
}
