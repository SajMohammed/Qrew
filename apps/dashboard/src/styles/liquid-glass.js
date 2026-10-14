// Softform liquid glass: the light and the lens for `.sf-liquid` (softform.css). No dependencies, any framework.
//
//   import { liquidGlass } from "./liquid-glass.js";
//   const stop = liquidGlass();   // once, in the browser, after the page mounts; stop() undoes everything
//
//   React:   useEffect(() => liquidGlass(), []);
//   Vue:     onMounted(() => (stop = liquidGlass())); onUnmounted(() => stop());
//   Plain:   <script type="module">import { liquidGlass } from "./liquid-glass.js"; liquidGlass();</script>
//
// The material itself is CSS and works everywhere: clear glass with a bright rim and a specular sheen. This adds:
//  - The light. On a mouse or trackpad, the sheen of the `.sf-liquid` under the pointer follows it (--mx, --my).
//  - The lens. Chromium can run an SVG filter over what is behind an element (`backdrop-filter: url()`), so there
//    the rounded edges of every `.sf-liquid[data-liquid]` also bend the page behind it, like a thick drop of water.
//    Each element gets a displacement map drawn for its own size and corner radius, redrawn when its size changes,
//    including elements added later. Other browsers, and anyone who prefers reduced transparency, keep the plain
//    glass. While the lens runs, <html> carries `data-refract`.
//
// Per element:
//   data-liquid="10"   the lens depth in px. Empty means half the bezel, which is also the cap: any deeper and the
//                      rim folds back on itself (the page shows twice). Keep it under 12 on chrome that carries words.
//   data-bezel="20"    the width of the curved rim in px (default 20, at most half the element's shorter side).

const SVG = "http://www.w3.org/2000/svg";
let runs = 0;

/** @returns {() => void} stop: removes the listeners, observers and filters. */
export function liquidGlass() {
  const cleanups = [];

  if (matchMedia("(pointer: fine)").matches) {
    let frame = 0;
    let last = null;
    const light = () => {
      frame = 0;
      const glass = last?.target?.closest?.(".sf-liquid");
      if (!glass) return;
      const box = glass.getBoundingClientRect();
      glass.style.setProperty("--mx", `${last.clientX - box.left}px`);
      glass.style.setProperty("--my", `${last.clientY - box.top}px`);
    };
    const onMove = (e) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(light);
    };
    addEventListener("pointermove", onMove, { passive: true });
    cleanups.push(() => {
      removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    });
  }

  // `userAgentData` exists only in Chromium-based browsers, the ones that render backdrop SVG filters.
  const refracts = "userAgentData" in navigator && !matchMedia("(prefers-reduced-transparency: reduce)").matches;
  if (refracts) {
    const run = runs++;
    const holder = document.createElementNS(SVG, "svg");
    holder.setAttribute("aria-hidden", "true");
    holder.setAttribute("width", "0");
    holder.setAttribute("height", "0");
    holder.style.position = "absolute";
    const defs = document.createElementNS(SVG, "defs");
    holder.append(defs);
    document.body.append(holder);
    document.documentElement.dataset.refract = "";

    const filters = new Map();
    const lensed = new Set();
    const lens = (el) => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
      const bezel = Math.min(Number(el.dataset.bezel) || 20, w / 2, h / 2);
      // Deeper than half the bevel and the rim folds back on itself (the page shows twice).
      const depth = Math.min(Number(el.dataset.liquid) || bezel / 2, bezel / 2);
      const key = `${w}x${h}r${radius}b${bezel}d${depth}`;
      let id = filters.get(key);
      if (!id) {
        id = `sf-liquid-${run}-${filters.size}`;
        defs.append(lensFilter(id, w, h, radius, bezel, depth));
        filters.set(key, id);
      }
      el.style.setProperty("--liquid-lens", `url(#${id})`);
      lensed.add(el);
    };

    const sizes = new ResizeObserver((entries) => entries.forEach((e) => lens(e.target)));
    const watch = (root) => {
      if (root instanceof HTMLElement && root.matches(".sf-liquid[data-liquid]")) sizes.observe(root);
      root.querySelectorAll?.(".sf-liquid[data-liquid]").forEach((el) => sizes.observe(el));
    };
    watch(document);
    // Glass that mounts later (a notification dropping in) gets its lens too.
    const added = new MutationObserver((records) =>
      records.forEach((r) => r.addedNodes.forEach((n) => n instanceof HTMLElement && watch(n))),
    );
    added.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      sizes.disconnect();
      added.disconnect();
      lensed.forEach((el) => el.style.removeProperty("--liquid-lens"));
      holder.remove();
      delete document.documentElement.dataset.refract;
    });
  }

  return () => cleanups.forEach((c) => c());
}

/**
 * A filter that bends the backdrop near a rounded rectangle's edge, as a convex glass bevel would.
 *
 * The displacement map stores, per pixel, where to sample the backdrop from: red for x, green for y,
 * mid-grey for "stay put". Inside the bevel the sample point moves inward along the edge's normal,
 * more strongly toward the rim, so the page seems to curve over the edge.
 */
function lensFilter(id, w, h, r, bezel, depth) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
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
        let nx;
        let ny;
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
  const set = (node, attrs) => Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  set(filter, {
    id,
    x: "0",
    y: "0",
    width: String(w),
    height: String(h),
    filterUnits: "userSpaceOnUse",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  const map = document.createElementNS(SVG, "feImage");
  set(map, { href: canvas.toDataURL(), x: "0", y: "0", width: String(w), height: String(h), preserveAspectRatio: "none", result: "map" });
  const bend = document.createElementNS(SVG, "feDisplacementMap");
  set(bend, { in: "SourceGraphic", in2: "map", scale: String(depth * 2), xChannelSelector: "R", yChannelSelector: "G" });
  filter.append(map, bend);
  return filter;
}
