import type { CSSProperties } from "react";
import { textOn } from "../lib/colour";

/** A shop's card as it sits in a customer's wallet — one of the four kinds Qrew issues. */
export type PassData = {
  name: string;
  program: string;
  colour: string;
  tag: string;
} & (
  | { kind: "stamps"; have: number; total: number }
  | { kind: "points"; points: number; goal: number }
  | { kind: "discount"; percent: number }
  | { kind: "membership"; tier: string; number: string }
);

/**
 * The merchant card, sized for the page: a tint of the shop's colour (never Qrew's lime — the split
 * rule), words in its top zone, the reward on a light glass tag in the foot.
 */
export function Pass({ pass, className = "", style }: { pass: PassData; className?: string; style?: CSSProperties }) {
  return (
    <article
      className={`sf-aura sf-aura--tint qrew-card mk-pass ${className}`}
      style={{ "--card-color": pass.colour, "--card-ink": textOn(pass.colour), ...style } as CSSProperties}
    >
      <div className="qrew-card__top">
        <div className="qrew-card__shop">
          <span className="qrew-card__logo">{pass.name[0]}</span>
          <div>
            <p className="qrew-card__name">{pass.name}</p>
            <p className="qrew-card__program">{pass.program}</p>
          </div>
        </div>
        <Figure pass={pass} />
      </div>
      <Body pass={pass} />
      <div className="qrew-card__foot">
        <span className="sf-tag">{pass.tag}</span>
      </div>
    </article>
  );
}

function Figure({ pass }: { pass: PassData }) {
  switch (pass.kind) {
    case "stamps":
      return (
        <p className="sf-figure sf-figure-lg">
          {pass.have}
          <span className="sf-figure__sup">/{pass.total}</span>
        </p>
      );
    case "points":
      return (
        <p className="sf-figure sf-figure-lg">
          {pass.points}
          <span className="sf-figure__unit">pts</span>
        </p>
      );
    case "discount":
      return (
        <p className="sf-figure sf-figure-lg">
          {pass.percent}
          <span className="sf-figure__unit">%</span>
        </p>
      );
    case "membership":
      return <p className="mk-pass__tier">{pass.tier}</p>;
  }
}

function Body({ pass }: { pass: PassData }) {
  switch (pass.kind) {
    case "stamps":
      return (
        <ol className="sf-steps mk-pass__stamps" aria-hidden>
          {Array.from({ length: pass.total }, (_, i) => (
            <li key={i} className={`sf-steps__dot${i < pass.have ? " sf-steps__dot--done" : ""}`} style={{ "--i": i } as CSSProperties} />
          ))}
        </ol>
      );
    case "points":
      return (
        <div className="mk-pass__bar" style={{ "--value": `${Math.min(100, (pass.points / pass.goal) * 100)}%` } as CSSProperties}>
          <span />
        </div>
      );
    case "discount":
      return <p className="mk-pass__line">Off every visit</p>;
    case "membership":
      return <p className="mk-pass__line">Member {pass.number}</p>;
  }
}
