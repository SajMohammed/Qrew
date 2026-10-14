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

  const choose = (next: Theme) => {
    if (next === theme) return;
    setTheme(next);
    try {
      localStorage.setItem("qrew-theme", next);
    } catch {}
    // A soft cross-fade where the browser supports it and the visitor hasn't asked for less motion.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && "startViewTransition" in document) document.startViewTransition(() => applyTheme(next));
    else applyTheme(next);
  };

  return (
    <div className="sf-tabs mk-theme" role="group" aria-label="Theme">
      <button type="button" className="sf-tabs__tab" aria-label="Light" aria-pressed={theme === "light"} onClick={() => choose("light")}>
        <SunIcon />
      </button>
      <button type="button" className="sf-tabs__tab" aria-label="Dark" aria-pressed={theme === "dark"} onClick={() => choose("dark")}>
        <MoonIcon />
      </button>
    </div>
  );
}
