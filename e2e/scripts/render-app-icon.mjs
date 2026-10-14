/*
 * One-off: render the card app's iOS home-screen icon, apps/card/public/apple-touch-icon.png.
 *
 * iOS ignores an SVG touch icon, so it needs a PNG — and a full-bleed one: iOS rounds the corners
 * itself, and the transparent corners of our rounded icon.svg would show as black. A real browser
 * draws it, because no PNG encoder in this repo can rasterise an SVG. (The "Q" is Anton's outline as
 * a path, so no font needs to be installed.)
 *
 * Not part of any build. Run again only if icon.svg changes:
 *   pnpm --filter @qrew/e2e exec node scripts/render-app-icon.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publicDir = fileURLToPath(new URL("../../apps/card/public/", import.meta.url));
const svg = readFileSync(`${publicDir}icon.svg`, "utf8")
  .replace('rx="112"', 'rx="0"')
  .replace("<svg ", '<svg width="180" height="180" ');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: `${publicDir}apple-touch-icon.png`, omitBackground: false });
await browser.close();
console.log("wrote apps/card/public/apple-touch-icon.png");
