import type { CSSProperties } from "react";
import { textOn } from "../lib/colour";
import { CheckIcon, GiftIcon } from "./icons";

const STEPS = [
  {
    title: "Paper cards get lost.",
    body: "They go through the wash, fill up with stamps anyone could fake, and tell you nothing about who came back.",
  },
  {
    title: "Qrew puts the card in their pocket.",
    body: "One scan of your counter QR and it's in their phone's wallet, next to their boarding passes. Always with them.",
  },
  {
    title: "Every visit lands as a stamp.",
    body: "Staff scan the card, the stamp lands in their wallet on the spot, and the reward is ready the moment it's earned.",
  },
];

const TOTAL = 8;
const COLOUR = "#6c2a4b";

/**
 * "From paper to pocket", told by scrolling. The stage pins while the section scrolls past: a paper
 * punch card flips over into the shop's wallet card, then the stamps land one by one until the reward
 * is ready. All of it runs on CSS scroll timelines (globals.css); where those aren't supported, or
 * motion is reduced, the section is a still: the three lines listed, the card already full.
 */
export function Story() {
  return (
    <section className="mk-story" id="story" aria-labelledby="story-title">
      <div className="mk-story__stage">
        <div className="mk-container mk-story__grid">
          <div className="mk-story__copy">
            <span className="sf-tag mk-eyebrow">From paper to pocket</span>
            <h2 id="story-title" className="mk-visually-hidden">
              From a paper punch card to a card in their wallet
            </h2>
            <ol className="mk-story__steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="mk-story__step" style={{ "--i": i } as CSSProperties}>
                  <h3 className="sf-display mk-story__title">{s.title}</h3>
                  <p className="sf-body-lg">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="mk-story__progress" aria-hidden>
              {STEPS.map((s, i) => (
                <i key={s.title} style={{ "--i": i } as CSSProperties} />
              ))}
            </div>
          </div>

          <div className="mk-story__visual" aria-hidden>
            <div className="mk-flip">
              <div className="mk-flip__face mk-paper">
                <p className="mk-paper__shop">Nomad Coffee</p>
                <p className="mk-paper__rule">Buy 7 · the 8th coffee is free</p>
                <ol className="mk-paper__holes">
                  {Array.from({ length: TOTAL }, (_, i) => (
                    <li key={i} className={i < 3 ? "is-stamped" : ""} style={{ "--r": `${(i * 37) % 30 - 15}deg` } as CSSProperties} />
                  ))}
                </ol>
                <p className="mk-paper__name">Name ____________</p>
              </div>

              <article
                className="mk-flip__face mk-flip__back sf-aura sf-aura--tint qrew-card"
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
                  <p className="sf-figure sf-figure-lg">
                    <span className="mk-story__count" />
                    <span className="sf-figure__sup">/{TOTAL}</span>
                  </p>
                </div>
                <ol className="sf-steps qrew-stamps mk-story__stamps" style={{ "--cols": 4 } as CSSProperties}>
                  {Array.from({ length: TOTAL }, (_, i) => (
                    <li key={i} className="sf-steps__dot sf-steps__dot--done" style={{ "--i": i } as CSSProperties}>
                      ☕
                    </li>
                  ))}
                </ol>
                <div className="qrew-card__foot">
                  <span className="sf-tag">Free coffee ready</span>
                </div>
              </article>
            </div>

            <div className="mk-lg mk-lg--tint mk-notif mk-story__notif" data-liquid="9" data-bezel="18">
              <span className="mk-notif__icon" style={{ "--c": COLOUR } as CSSProperties}>
                <GiftIcon />
              </span>
              <span className="mk-notif__text">
                <b>Nomad Coffee</b>
                Your free coffee is ready
              </span>
              <span className="mk-notif__time">now</span>
            </div>
            <span className="sf-status sf-status--positive sf-status--lg mk-story__reward">
              <CheckIcon /> Reward ready
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
