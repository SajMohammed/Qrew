"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CheckIcon, GiftIcon, QrIcon, WalletIcon } from "./icons";

const TOTAL = 10;
const START = 3;

/**
 * The hero's live moment: a shop's card filling up at the counter, stamp by stamp, until the reward
 * is ready — then it starts again. The card is the shop's (a tint of their colour, never Qrew's
 * lime); Qrew's part is the glass around it: the toast, the live number, the bubbles.
 *
 * Under reduced motion it holds still on one frame.
 */
export function HeroDemo() {
  const [n, setN] = useState(START);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const next = (v: number) => {
      // A beat on the first stamp, a steady rhythm after, and a longer hold on the reward.
      const wait = v >= TOTAL ? 3400 : v === START ? 2000 : 1300;
      timer = window.setTimeout(() => {
        const to = v >= TOTAL ? START : v + 1;
        setN(to);
        next(to);
      }, wait);
    };
    next(START);
    return () => window.clearTimeout(timer);
  }, []);

  const ready = n >= TOTAL;
  return (
    <div
      className="mk-demo"
      role="img"
      aria-label="A Nomad Coffee stamp card in a phone wallet, filling up stamp by stamp until a free coffee is ready"
    >
      <div className="mk-demo__inner" aria-hidden>
        <div key={`toast-${n}`} className="sf-toast mk-demo__toast">
          {ready ? <GiftIcon /> : <CheckIcon />}
          {ready ? "Free coffee ready" : `Stamp added · ${n} of ${TOTAL}`}
        </div>

        <article
          className={`sf-aura sf-aura--tint qrew-card mk-demo__card${ready ? " qrew-card--ready" : ""}`}
          style={{ "--card-color": "#6c2a4b", "--card-ink": "#fbfbf7" } as CSSProperties}
        >
          <div className="qrew-card__top">
            <div className="qrew-card__shop">
              <span className="qrew-card__logo">N</span>
              <div>
                <p className="qrew-card__name">Nomad Coffee</p>
                <p className="qrew-card__program">Coffee club</p>
              </div>
            </div>
            <p key={`n-${n}`} className="sf-figure sf-figure-xl mk-tick">
              {n}
              <span className="sf-figure__sup">/{TOTAL}</span>
            </p>
          </div>
          <ol className="sf-steps qrew-stamps" style={{ "--cols": 5 } as CSSProperties}>
            {Array.from({ length: TOTAL }, (_, i) => {
              const done = i < n;
              const landed = done && i === n - 1 && n > START;
              return (
                <li key={landed ? `land-${n}` : i} className={`sf-steps__dot${done ? " sf-steps__dot--done" : ""}${landed ? " qrew-land" : ""}`}>
                  {done ? "☕" : ""}
                </li>
              );
            })}
          </ol>
          <div className="qrew-card__foot">
            <span className="sf-tag">{ready ? "Free coffee ready" : `${TOTAL - n} to a free coffee`}</span>
          </div>
        </article>

        <div className="sf-glass sf-glass--strong mk-demo__metric">
          <p className="sf-card__label">Stamps today</p>
          <p className="sf-figure sf-figure-lg">
            {139 + n}
            <span className="sf-figure__sup sf-figure__sup--up">+12%</span>
          </p>
        </div>

        <span className="sf-bubble sf-bubble--lens mk-demo__orbit mk-demo__orbit--1">
          <QrIcon />
        </span>
        <span className="sf-bubble sf-bubble--lens mk-demo__orbit mk-demo__orbit--2">
          <WalletIcon />
        </span>
      </div>
    </div>
  );
}
