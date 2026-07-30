import { useEffect, useRef } from "react";

/**
 * A one-shot burst for the moment a card fills up. Hand-rolled on a canvas rather than pulling in a
 * library: it's ~40 lines, it can use the merchant's own brand colour, and it costs nothing on the
 * (overwhelmingly common) journeys where no reward is earned.
 *
 * Honours reduced-motion by simply not running — the reward banner is the real message.
 */
export function Confetti({ colors, run }: { colors: string[]; run: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (canvas.width = canvas.offsetWidth * dpr);
    const h = (canvas.height = canvas.offsetHeight * dpr);

    const pieces = Array.from({ length: 70 }, (_, i) => ({
      x: w / 2,
      y: h * 0.42,
      vx: (Math.random() - 0.5) * 11 * dpr,
      vy: (Math.random() * -9 - 3) * dpr,
      size: (3 + Math.random() * 4) * dpr,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length] ?? "#cbfa5b",
    }));

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.vy += 0.32 * dpr; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - frame / 90);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (frame < 90) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, colors]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 size-full"
    />
  );
}
