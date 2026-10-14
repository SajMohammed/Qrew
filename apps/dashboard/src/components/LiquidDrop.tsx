import { useLayoutEffect, useRef } from "react";

const SELECTED = '[aria-pressed="true"], [aria-current="page"], [aria-selected="true"]';

/**
 * Softform's selection drop (`.sf-tabs__drop`): a drop of liquid glass that sits over the selected item of
 * its parent (a `.sf-tabs--liquid` group, or the dock) and slides to the next one on a spring, stretching
 * as it goes and wobbling as it lands. Put it inside the group; it finds the selected item itself.
 *
 * `watch` is whatever changes the selection, so the drop moves when it does. `lens` makes this the screen's
 * one lens: in Chromium the drop then bends what's under it. Keep it to one per screen.
 */
export function LiquidDrop({ watch, lens = false, className }: { watch: unknown; lens?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const lastX = useRef<number | null>(null);

  useLayoutEffect(() => {
    const drop = ref.current;
    const group = drop?.parentElement;
    if (!drop || !group) return;

    const place = () => {
      const on = group.querySelector<HTMLElement>(SELECTED);
      drop.style.opacity = on ? "" : "0";
      if (!on) return null;
      drop.style.setProperty("--x", `${on.offsetLeft}px`);
      drop.style.setProperty("--w", `${on.offsetWidth}px`);
      return on.offsetLeft;
    };

    const x = place();
    const moved = lastX.current !== null && x !== null && x !== lastX.current;
    if (moved && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drop.animate(
        [{ scale: "1 1" }, { scale: "1.2 0.84", offset: 0.35 }, { scale: "0.95 1.06", offset: 0.7 }, { scale: "1 1" }],
        { duration: 600, easing: "ease-out" },
      );
    }
    lastX.current = x;

    // Labels and widths change with the viewport (and fonts arriving): keep the drop on its item.
    const sizes = new ResizeObserver(() => place());
    sizes.observe(group);
    return () => sizes.disconnect();
  }, [watch]);

  return (
    <span
      ref={ref}
      aria-hidden
      className={["sf-tabs__drop sf-liquid", className].filter(Boolean).join(" ")}
      data-liquid={lens ? "" : undefined}
      data-bezel={lens ? "18" : undefined}
    />
  );
}
