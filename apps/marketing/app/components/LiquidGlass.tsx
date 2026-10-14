"use client";

import { useEffect } from "react";

const SVG = "http://www.w3.org/2000/svg";

/**
 * Liquid glass, for every element marked `data-liquid` (styled by `.mk-lg` in globals.css).
 *
 * The material itself is CSS and works everywhere: clear glass with a bright rim and a specular sheen.
 * Two things need script:
 *  - The light. On a mouse or trackpad, the sheen of the glass under the pointer follows it.
 *  - The lens. Chromium can run an SVG filter over what is behind an element (`backdrop-filter: url()`),
 *    so there the glass's rounded edges also bend the page behind it, like a thick drop of water. Each
 *    element gets a displacement map drawn for its own size and corner radius. Other browsers skip this
 *    and keep the plain glass.
 */
export function LiquidGlass() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (matchMedia("(pointer: fine)").matches) {
      let frame = 0;
      let last: PointerEvent | null = null;
      const light = () => {
        frame = 0;
        const glass = (last?.target as Element | null)?.closest?.<HTMLElement>(".mk-lg");
        if (!glass || !last) return;
        const box = glass.getBoundingClientRect();
        glass.style.setProperty("--mx", `${last.clientX - box.left}px`);
        glass.style.setProperty("--my", `${last.clientY - box.top}px`);
      };
      const onMove = (e: PointerEvent) => {
        last = e;
        if (!frame) frame = requestAnimationFrame(light);
      };
      addEventListener("pointermove", onMove, { passive: true });
      cleanups.push(() => removeEventListener("pointermove", onMove));
    }

    // `userAgentData` exists only in Chromium-based browsers, the ones that render backdrop SVG filters.
    const refracts = "userAgentData" in navigator && !matchMedia("(prefers-reduced-transparency: reduce)").matches;
    const defs = document.getElementById("mk-lg-defs");
    if (refracts && defs) {
      document.documentElement.dataset.refract = "";
      const filters = new Map<string, string>();

      const lens = (el: HTMLElement) => {
        const w = Math.round(el.offsetWidth);
        const h = Math.round(el.offsetHeight);
        if (!w || !h) return;
        const style = getComputedStyle(el);
        const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, w / 2, h / 2);
        const bezel = Math.min(Number(el.dataset.bezel) || 20, w / 2, h / 2);
        // Deeper than half the bevel and the rim folds back on itself (the page shows twice).
        const depth = Math.min(Number(el.dataset.liquid) || bezel / 2, bezel / 2);
        const key = `${w}x${h}r${radius}b${bezel}d${depth}`;
        let id = filters.get(key);
        if (!id) {
          id = `mk-lg-${filters.size}`;
          defs.appendChild(lensFilter(id, w, h, radius, bezel, depth));
          filters.set(key, id);
        }
        const blur = style.getPropertyValue("--lg-blur").trim() || "0.5px";
        el.style.backdropFilter = `url(#${id}) blur(${blur}) saturate(1.8)`;
      };

      const sizes = new ResizeObserver((entries) => entries.forEach((e) => lens(e.target as HTMLElement)));
      const watch = (root: ParentNode) => {
        if (root instanceof HTMLElement && root.matches("[data-liquid]")) sizes.observe(root);
        root.querySelectorAll?.<HTMLElement>("[data-liquid]").forEach((el) => sizes.observe(el));
      };
      watch(document);
      // Some glass mounts later (the demo's notification is remounted for every stamp).
      const added = new MutationObserver((records) =>
        records.forEach((r) => r.addedNodes.forEach((n) => n instanceof HTMLElement && watch(n))),
      );
      added.observe(document.body, { childList: true, subtree: true });
      cleanups.push(() => {
        sizes.disconnect();
        added.disconnect();
        delete document.documentElement.dataset.refract;
      });
    }

    return () => cleanups.forEach((c) => c());
  }, []);

  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <defs id="mk-lg-defs" />
    </svg>
  );
}

/**
 * A filter that bends the backdrop near a rounded rectangle's edge, as a convex glass bevel would.
 *
 * The displacement map stores, per pixel, where to sample the backdrop from: red for x, green for y,
 * mid-grey for "stay put". Inside the bevel the sample point moves inward along the edge's normal,
 * more strongly toward the rim, so the page seems to curve over the edge.
 */
function lensFilter(id: string, w: number, h: number, r: number, bezel: number, depth: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - w / 2;
      const py = y + 0.5 - h / 2;
      // Signed distance to the rounded rectangle (negative inside).
      const qx = Math.abs(px) - (w / 2 - r);
      const qy = Math.abs(py) - (h / 2 - r);
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      let dx = 0;
      let dy = 0;
      const inset = -sd;
      if (inset >= 0 && inset < bezel) {
        let nx: number;
        let ny: number;
        if (qx > 0 && qy > 0) {
          const len = Math.hypot(qx, qy) || 1;
          nx = qx / len;
          ny = qy / len;
        } else if (qx > qy) {
          nx = 1;
          ny = 0;
        } else {
          nx = 0;
          ny = 1;
        }
        const t = 1 - inset / bezel;
        const m = t * t;
        dx = -Math.sign(px) * nx * m;
        dy = -Math.sign(py) * ny * m;
      }
      const i = (y * w + x) * 4;
      d[i] = 128 + dx * 127;
      d[i + 1] = 128 + dy * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const filter = document.createElementNS(SVG, "filter");
  for (const [k, v] of Object.entries({
    id,
    x: "0",
    y: "0",
    width: String(w),
    height: String(h),
    filterUnits: "userSpaceOnUse",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  }))
    filter.setAttribute(k, v);
  const map = document.createElementNS(SVG, "feImage");
  for (const [k, v] of Object.entries({ href: canvas.toDataURL(), x: "0", y: "0", width: String(w), height: String(h), preserveAspectRatio: "none", result: "map" }))
    map.setAttribute(k, v);
  const bend = document.createElementNS(SVG, "feDisplacementMap");
  for (const [k, v] of Object.entries({ in: "SourceGraphic", in2: "map", scale: String(depth * 2), xChannelSelector: "R", yChannelSelector: "G" }))
    bend.setAttribute(k, v);
  filter.append(map, bend);
  return filter;
}
