import { useEffect, useRef } from "react";

/** How long the burst lasts. Time-based, so it behaves the same at 120fps and at 30. */
const DURATION_MS = 1500;

/**
 * A one-shot burst for the moment a card fills up. Hand-rolled on a canvas rather than pulling in a
 * library: it's ~50 lines, it can use the merchant's own brand colour, and it costs nothing on the
 * (overwhelmingly common) journeys where no reward is earned.
 *
 * Honours reduced-motion by simply not running — the reward banner is the real message.
 */
export function Confetti({ colors, run }: { colors: string[]; run: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Callers build this array inline, so a fresh identity every render would restart the burst on
  // every poll tick. Depend on the contents instead.
  const paletteKey = colors.join(",");

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Whatever happens next — not running, reduced motion, finished, or torn down mid-flight — the
    // canvas must be left blank. Skipping this is what froze the last painted frame onto the card.
    const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!run) {
      clear();
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clear();
      return;
    }

    const palette = paletteKey.split(",");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (canvas.width = canvas.offsetWidth * dpr);
    const h = (canvas.height = canvas.offsetHeight * dpr);
    if (w === 0 || h === 0) return; // laid out at zero size — nothing to draw on

    const pieces = Array.from({ length: 70 }, (_, i) => ({
      x: w / 2,
      y: h * 0.42,
      vx: (Math.random() - 0.5) * 11 * dpr,
      vy: (Math.random() * -9 - 3) * dpr,
      size: (3 + Math.random() * 4) * dpr,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: palette[i % palette.length] ?? "#cbfa5b",
    }));

    const start = performance.now();
    let last = start;
    let raf = 0;

    const tick = (now: number) => {
      const progress = (now - start) / DURATION_MS;
      if (progress >= 1) {
        clear(); // finished cleanly
        return;
      }
      // Step by real elapsed time (clamped, so a backgrounded tab doesn't teleport everything).
      const dt = Math.min(now - last, 50) / 16.67;
      last = now;

      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.vy += 0.32 * dpr * dt; // gravity
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [run, paletteKey]);

  return (
    <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-20 size-full" />
  );
}
