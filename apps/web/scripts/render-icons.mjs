// Renders the PNG icons from the SVG mark (TON-114), with the browser the browser tests use. Run it after changing
// public/favicon.svg or public/icon-maskable.svg, and commit what it writes:
//   cd apps/web && node scripts/render-icons.mjs
// Playwright's library needs Node, not Bun.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const publicDir = path.join(import.meta.dirname, "..", "public");
const favicon = await readFile(path.join(publicDir, "favicon.svg"), "utf8");
const maskable = await readFile(path.join(publicDir, "icon-maskable.svg"), "utf8");
// iOS rounds the corners itself and fills transparency with black, so its icon is the full square.
const square = favicon.replace('rx="7"', 'rx="0"');

const icons = [
  { file: "favicon-32.png", svg: favicon, size: 32 },
  { file: "icon-192.png", svg: favicon, size: 192 },
  { file: "icon-512.png", svg: favicon, size: 512 },
  { file: "icon-maskable-512.png", svg: maskable, size: 512 },
  { file: "apple-touch-icon.png", svg: square, size: 180 },
];

const browser = await chromium.launch();
await Promise.all(
  icons.map(async ({ file, svg, size }) => {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0">${svg.replace("<svg", `<svg width="${size}" height="${size}"`)}</body>`,
    );
    await page.screenshot({ path: path.join(publicDir, file), omitBackground: true });
    await page.close();
    console.log(`Wrote public/${file} (${size} px).`);
  }),
);
await browser.close();
