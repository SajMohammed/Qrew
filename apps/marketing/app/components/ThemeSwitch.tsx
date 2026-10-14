"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { applyTheme, type Theme } from "../lib/theme";

/** Light / dark, as a two-button segmented control. Light is the default; a choice is remembered. */
export function ThemeSwitch() {
  // The server can't know a remembered choice, so start from light and read the real one after hydration
  // (the pre-paint script in layout.tsx has already applied it to the page itself).
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const choose = (next: Theme, from: HTMLElement) => {
    if (next === theme) return;
    setTheme(next);
    try {
      localStorage.setItem("qrew-theme", next);
    } catch {}
    // The new theme spreads out from the switch as a growing circle, where the browser supports view
    // transitions and the visitor hasn't asked for less motion. Otherwise it simply changes.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("startViewTransition" in document)) return applyTheme(next);
    const box = from.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(() => applyTheme(next)).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  };

  return (
    <div className="sf-tabs mk-theme" role="group" aria-label="Theme">
      <button type="button" className="sf-tabs__tab" aria-label="Light" aria-pressed={theme === "light"} onClick={(e) => choose("light", e.currentTarget)}>
        <SunIcon />
      </button>
      <button type="button" className="sf-tabs__tab" aria-label="Dark" aria-pressed={theme === "dark"} onClick={(e) => choose("dark", e.currentTarget)}>
        <MoonIcon />
      </button>
    </div>
  );
}
