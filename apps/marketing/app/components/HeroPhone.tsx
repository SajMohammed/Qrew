"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { textOn } from "../lib/colour";
import { CheckIcon, GiftIcon } from "./icons";

const TOTAL = 10;
const START = 3;
const COLOUR = "#6c2a4b";

/**
 * The hero's live moment: a customer's phone, open on Wallet, with a shop's card filling up stamp by
 * stamp. Each stamp arrives as a liquid glass notification over the screen, until the reward is ready —
 * then it starts again. Under reduced motion it holds still on one frame.
 */
export function HeroPhone() {
  const [n, setN] = useState(START);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const next = (v: number) => {
      // A beat before the first stamp, a steady rhythm after, and a longer hold on the reward.
      const wait = v >= TOTAL ? 4200 : v === START ? 2400 : 1700;
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
      className="mk-phone"
      role="img"
      aria-label="A phone open on Wallet: a Nomad Coffee stamp card fills up stamp by stamp, each one announced by a notification, until a free coffee is ready"
    >
      <div className="mk-phone__screen" aria-hidden>
        <div className="mk-phone__status">
          <span>9:41</span>
          <span className="mk-phone__camera" />
          <span className="mk-phone__icons">
            <i />
            <i />
            <i />
          </span>
        </div>

        {n > START && (
          <div key={n} className={`mk-lg mk-lg--tint mk-notif${ready ? " mk-notif--hold" : ""}`} data-liquid="9" data-bezel="18">
            <span className="mk-notif__icon" style={{ "--c": COLOUR } as CSSProperties}>
              {ready ? <GiftIcon /> : <CheckIcon />}
            </span>
            <span className="mk-notif__text">
              <b>Nomad Coffee</b>
              {ready ? "Your free coffee is ready" : `Stamp added · ${n} of ${TOTAL}`}
            </span>
            <span className="mk-notif__time">now</span>
          </div>
        )}

        <div className="mk-phone__head">
          <p className="mk-phone__title">Wallet</p>
          <span className="mk-phone__add">+</span>
        </div>

        <div className="mk-phone__stack">
          <div className="mk-phone__peek" style={{ "--card-color": "#1f5673" } as CSSProperties}>
            <span>Fade Barbers</span>
            <span>3/6</span>
          </div>
          <div className="mk-phone__peek" style={{ "--card-color": "#b0413e" } as CSSProperties}>
            <span>Mist Bakery</span>
            <span>5/8</span>
          </div>
          <article
            className={`sf-aura sf-aura--tint qrew-card mk-phone__card${ready ? " qrew-card--ready" : ""}`}
            style={{ "--card-color": COLOUR, "--card-ink": textOn(COLOUR) } as CSSProperties}
          >
            <div className="qrew-card__top">
              <div className="qrew-card__shop">
                <span className="qrew-card__logo">N</span>
                <div>
                  <p className="qrew-card__name">Nomad Coffee</p>
                  <p className="qrew-card__program">Coffee club</p>
                </div>
              </div>
              {/* Archivo, not Doto: the phone is a miniature, and dot-matrix figures stay at 48px and up. */}
              <p key={`n-${n}`} className="sf-figure sf-figure-md mk-tick">
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
          {/* The code staff scan at the counter: Qrew's, on its own white panel, never on the shop's colour. */}
          <div className="qrew-qr mk-phone__qr">
            <QrCode />
          </div>
          <p className="mk-phone__hint">Show this at the counter to collect stamps</p>
        </div>
      </div>
    </div>
  );
}

/** A stable pseudo-random number per module, so the pattern looks like data but never changes. */
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A QR-like pattern (21 modules: three finder squares, timing lines, data). Decorative: it encodes nothing. */
function QrCode() {
  const size = 21;
  let d = "";
  // The three corners hold a finder square plus a one-module quiet border.
  const corner = (x: number, y: number) => (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let on: boolean;
      if (corner(x, y)) {
        const cx = x > 12 ? x - 14 : x;
        const cy = y > 12 ? y - 14 : y;
        const ring = Math.max(Math.abs(cx - 3), Math.abs(cy - 3));
        on = ring <= 3 && ring !== 2;
      } else if (x === 6 || y === 6) {
        on = (x + y) % 2 === 0;
      } else {
        on = hash(x, y) % 9 < 4;
      }
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return (
    <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} shapeRendering="crispEdges">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
