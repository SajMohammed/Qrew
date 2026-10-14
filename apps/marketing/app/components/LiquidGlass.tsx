"use client";

import { useEffect } from "react";
// Softform's script, copied verbatim from the design system next to its CSS: re-copy to update, never edit.
import { liquidGlass } from "../styles/liquid-glass.js";

/**
 * Starts Softform's liquid glass for every `.sf-liquid` on the page: the sheen that follows the pointer
 * and, in Chromium, the lens that bends the page behind each `[data-liquid]` edge. Renders nothing.
 */
export function LiquidGlass() {
  useEffect(() => liquidGlass(), []);
  return null;
}
