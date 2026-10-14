"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Pass, type PassData } from "./Pass";
import { CheckIcon } from "./icons";

const KINDS: Array<{ id: string; label: string; title: string; points: string[]; pass: PassData }> = [
  {
    id: "stamps",
    label: "Stamps",
    title: "Buy nine, the tenth is on you.",
    points: ["You set how many stamps earn the reward", "Staff stamp in one tap at the counter", "The reward is ready the moment the card fills"],
    pass: { kind: "stamps", name: "Nomad Coffee", program: "Coffee club", colour: "#6c2a4b", have: 7, total: 10, tag: "3 to a free flat white" },
  },
  {
    id: "points",
    label: "Points",
    title: "Points on every visit.",
    points: ["Choose how many points a visit earns", "Customers see their balance in their wallet", "Spend them on rewards you set"],
    pass: { kind: "points", name: "Mist Bakery", program: "Bread points", colour: "#b0413e", points: 140, goal: 200, tag: "60 to a free loaf" },
  },
  {
    id: "discount",
    label: "Discount",
    title: "A standing discount, always in their pocket.",
    points: ["Pick the rate card holders get", "Staff see it the moment they scan", "No codes to remember or type in"],
    pass: { kind: "discount", name: "Fade Barbers", program: "Regulars", colour: "#1f5673", percent: 10, tag: "Show at the counter" },
  },
  {
    id: "membership",
    label: "Membership",
    title: "Members, with perks.",
    points: ["Give your best customers a members' card", "Their status shows at the counter", "Perks you choose, from extras to early access"],
    pass: { kind: "membership", name: "Layla Salon", program: "Glow members", colour: "#8a4b2f", tier: "Gold", number: "No. 0482", tag: "Members' perks" },
  },
];

/**
 * "One card, every kind of reward": a segmented control whose selection is a drop of liquid glass. It
 * slides to the chosen tab, stretching as it moves and settling with a little wobble, and bends the
 * label under it. The panel below shows that kind of card and what it does.
 */
export function Rewards() {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const drop = useRef<HTMLSpanElement>(null);

  // Put the drop under the active tab (and keep it there as the layout changes).
  useLayoutEffect(() => {
    const place = () => {
      const tab = tabs.current[active];
      const el = drop.current;
      if (!tab || !el) return;
      el.style.setProperty("--x", `${tab.offsetLeft}px`);
      el.style.setProperty("--w", `${tab.offsetWidth}px`);
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [active]);

  const choose = (i: number) => {
    if (i === active) return;
    setActive(i);
    // Stretch while moving, then let the spring settle it.
    const el = drop.current;
    if (el && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate(
        [{ scale: "1 1" }, { scale: "1.22 0.82", offset: 0.35 }, { scale: "0.94 1.08", offset: 0.7 }, { scale: "1 1" }],
        { duration: 620, easing: "ease-out" },
      );
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + KINDS.length) % KINDS.length;
    choose(next);
    tabs.current[next]?.focus();
  };

  const kind = KINDS[active]!;
  return (
    <div className="mk-rewards">
      <div className="mk-lg mk-lg--tint mk-tabs" role="tablist" aria-label="Kinds of card" onKeyDown={onKey}>
        <span ref={drop} className="mk-lg mk-tabs__drop" data-liquid="12" data-bezel="24" aria-hidden />
        {KINDS.map((k, i) => (
          <button
            key={k.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`reward-tab-${k.id}`}
            aria-selected={i === active}
            aria-controls="reward-panel"
            tabIndex={i === active ? 0 : -1}
            className="mk-tabs__tab"
            onClick={() => choose(i)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div id="reward-panel" role="tabpanel" aria-labelledby={`reward-tab-${kind.id}`} className="mk-rewards__panel">
        <div key={kind.id} className="mk-rewards__visual" aria-hidden>
          <Pass pass={kind.pass} />
        </div>
        <div key={`${kind.id}-copy`} className="mk-rewards__copy">
          <h3 className="sf-title">{kind.title}</h3>
          <ul className="mk-ticks">
            {kind.points.map((p) => (
              <li key={p}>
                <span className="sf-bubble sf-bubble--sm sf-bubble--primary" aria-hidden>
                  <CheckIcon />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
