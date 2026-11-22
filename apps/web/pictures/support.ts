// What every picture needs (TON-308): a signed-in page of the demo collection at a computer's or a phone's size, the
// invented covers in place of the image proxy's artwork, and a way to save a part of the screen as WebP under
// src/help/pictures/. The pictures API (apps/api/src/pictures-server.ts) wrote the sessions and the link's token.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { z } from "zod";

import { bootstrapSchema } from "@tonaris/domain";

import { picturesApiPort, picturesPort, sessionsFile } from "../playwright.pictures.config";
import { coverTitles, demoCovers, landingCovers } from "./covers";

export const webOrigin = `http://localhost:${picturesPort}`;
export const apiOrigin = `http://localhost:${picturesApiPort}`;
const outDir = path.join(import.meta.dirname, "../src/help/pictures");

const sessionsSchema = z.object({
  owner: z.string(),
  mira: z.string(),
  sam: z.string(),
  linkToken: z.string(),
});

/** The sessions the pictures API signed in with, and Late night's link token. */
export async function sessions() {
  const text = await readFile(path.join(import.meta.dirname, "..", sessionsFile), "utf8");
  return sessionsSchema.parse(JSON.parse(text));
}

/** The sizes pictures are taken at: a laptop's window, and a phone's. */
export const devices = {
  computer: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  },
} as const;

export type Who = "owner" | "mira" | "sam" | "guest";

/** A page as `who`, at `device`'s size, with the invented covers served in place of the artwork. */
export async function open(
  browser: Browser,
  who: Who,
  device: keyof typeof devices = "computer",
): Promise<Page> {
  const context = await browser.newContext({ ...devices[device], colorScheme: "dark" });
  // The phone's user agent is an iPhone's: its Home Screen banner (DS-123) stays closed in the pictures.
  await context.addInitScript(() => localStorage.setItem("tonaris:install-banner", "closed"));
  if (who !== "guest") {
    const cookie = (await sessions())[who];
    const equals = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, equals),
        value: cookie.slice(equals + 1),
        domain: "localhost",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  await serveCovers(browser, context);
  return context.newPage();
}

/** Opens `route` and waits until the workspace is live and its pictures have loaded. */
export async function visit(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.waitForFunction(() => window.tonarisSync?.engine.status === "live");
  await settled(page);
}

/** Waits for fonts, images and the page's fades (DS-17) to finish. */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // Loaded or failed: a cover that fails shows its letter tile, as in the app.
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  // Fades and slides finish; a spinner's endless loop never does, so it doesn't count.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
}

type Ids = { containers: Map<string, string>; albums: Map<string, string> };

/** The demo's folders and lists by name, and its albums by title, as the API has them for the page's person. */
export async function ids(page: Page): Promise<Ids> {
  const response = await page.request.get(`${apiOrigin}/v1/sync/bootstrap`);
  const bootstrap = bootstrapSchema.parse(await response.json());
  return {
    containers: new Map(bootstrap.containers.map((each) => [each.name, each.id])),
    albums: new Map(bootstrap.albums.map((each) => [each.title, each.id])),
  };
}

/** The id of the folder, list or album named `name`. */
export function idOf(found: Ids, name: string): string {
  const id = found.containers.get(name) ?? found.albums.get(name);
  if (!id) throw new Error(`The demo has no folder, list or album called "${name}"`);
  return id;
}

let covers: Promise<Map<string, Buffer>> | undefined;

/** Every cover as a PNG, drawn once per run on the landing page, where the covers' fonts and classes are. */
function coverImages(browser: Browser): Promise<Map<string, Buffer>> {
  covers ??= (async () => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${webOrigin}/welcome`);
    await page.evaluate(() => document.fonts.ready);
    const size = 600;
    // The landing page's covers, by the title in their second line, then the ones drawn here; the page is emptied
    // after, so each cover is drawn alone at the top left, with the page's fonts and classes.
    const markup = await page.evaluate(
      ({ landing, drawn, size: side }) => {
        const found: Record<string, string> = {};
        for (const svg of document.querySelectorAll<SVGSVGElement>('svg[viewBox="0 0 200 200"]')) {
          const key = landing[svg.querySelectorAll("text")[1]?.textContent ?? ""];
          if (!key || found[key]) continue;
          const copy = svg.cloneNode(true);
          if (!(copy instanceof SVGSVGElement)) continue;
          copy.setAttribute("width", String(side));
          copy.setAttribute("height", String(side));
          copy.removeAttribute("class");
          copy.classList.add("block", "font-sans");
          found[key] = copy.outerHTML;
        }
        document.body.replaceChildren();
        return { ...found, ...drawn };
      },
      { landing: landingCovers, drawn: demoCovers(size), size },
    );
    const missing = Object.keys(coverTitles).filter((key) => !(key in markup));
    if (missing.length > 0) throw new Error(`No cover drawn for ${missing.join(", ")}`);
    const images = new Map<string, Buffer>();
    for (const [key, svg] of Object.entries(markup)) {
      // One at a time, in the one place the picture is taken from.
      // oxlint-disable-next-line no-await-in-loop
      await page.evaluate(
        (html) =>
          document.body.replaceChildren(document.createRange().createContextualFragment(html)),
        svg,
      );
      // oxlint-disable-next-line no-await-in-loop
      images.set(key, await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
    }
    await context.close();
    return images;
  })();
  return covers;
}

/** Answers the image proxy's requests (TS-103) with the invented covers, readable by the page for its wash (DS-46). */
async function serveCovers(browser: Browser, context: BrowserContext): Promise<void> {
  const images = await coverImages(browser);
  await context.route(`${apiOrigin}/img/**`, async (route) => {
    const encoded = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    const artwork = Buffer.from(encoded, "base64url").toString("utf8");
    const key = /\/([\w-]+)\.png$/.exec(artwork)?.[1];
    const body = key ? images.get(key) : undefined;
    if (!body) return route.fulfill({ status: 404 });
    return route.fulfill({
      status: 200,
      body,
      headers: {
        "content-type": "image/png",
        "access-control-allow-origin": webOrigin,
        vary: "Origin",
        "cache-control": "public, max-age=86400",
      },
    });
  });
}

type Shot = {
  /** What the picture shows: the whole window when not given, else the box around these, with `pad` around it. */
  of?: Locator | readonly Locator[];
  pad?: number;
  /** WebP's quality, 0 to 1. */
  quality?: number;
};

/** Saves the picture `name` as src/help/pictures/{name}.webp. */
export async function shot(page: Page, name: string, { of, pad = 24, quality = 0.9 }: Shot = {}) {
  await settled(page);
  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (of) {
    const boxes = await Promise.all(
      (Array.isArray(of) ? of : [of]).map(async (locator: Locator) => {
        await expect(locator).toBeVisible();
        const box = await locator.boundingBox();
        if (!box) throw new Error(`"${name}": a part of the picture has no box`);
        return box;
      }),
    );
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
    const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const right = Math.min(viewport.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
    const bottom = Math.min(viewport.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
    clip = { x, y, width: right - x, height: bottom - y };
  }
  const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
  const webp = await toWebp(page.context(), png, quality);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${name}.webp`), webp);
}

/** Chromium's own WebP encoder, on a blank page out of reach of the app's CSP. */
async function toWebp(context: BrowserContext, png: Buffer, quality: number): Promise<Buffer> {
  const page = await context.newPage();
  try {
    const bytes = await page.evaluate(
      async ({ data, q }) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(data)], { type: "image/png" }),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/webp", quality: q });
        return [...new Uint8Array(await blob.arrayBuffer())];
      },
      { data: [...png], q: quality },
    );
    return Buffer.from(bytes);
  } finally {
    await page.close();
  }
}
