// Installing Tonaris on a phone (TON-115, DS-110): Chrome loads the manifest the page links, the manifest meets
// Chrome's install criteria (a name, 192 and 512 px icons, a start URL, standalone display, no related native app),
// its icons are served, and iOS gets its icon and full screen. Chromium only, for Chrome's view of the manifest.

import { expect, test } from "@playwright/test";
import { z } from "zod";

test.use({ storageState: { cookies: [], origins: [] } });

const manifestSchema = z.object({
  name: z.string(),
  short_name: z.string(),
  start_url: z.string(),
  display: z.string(),
  prefer_related_applications: z.boolean().optional(),
  icons: z.array(
    z.object({ src: z.string(), sizes: z.string(), type: z.string(), purpose: z.string() }),
  ),
});

test("Chrome loads an installable manifest, and iOS gets its icon and full screen", async ({
  page,
  request,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chrome's view of the manifest");
  await page.goto("/sign-in");

  // Chrome found the manifest the page links, and loaded it.
  const devtools = await page.context().newCDPSession(page);
  await expect
    .poll(async () => (await devtools.send("Page.getAppManifest")).data?.length ?? 0)
    .toBeGreaterThan(0);
  const { url, data } = await devtools.send("Page.getAppManifest");
  expect(new URL(url).pathname).toBe("/manifest.webmanifest");
  expect((await request.get(url)).headers()["content-type"]).toContain("application/manifest+json");

  const manifest = manifestSchema.parse(JSON.parse(data ?? ""));
  expect(manifest).toMatchObject({
    name: "Tonaris",
    short_name: "Tonaris",
    start_url: "/c",
    display: "standalone",
  });
  expect(manifest.prefer_related_applications).toBeUndefined();
  expect(manifest.icons.map(({ sizes, type, purpose }) => `${sizes} ${type} ${purpose}`)).toEqual(
    expect.arrayContaining([
      "192x192 image/png any",
      "512x512 image/png any",
      "512x512 image/png maskable",
    ]),
  );
  for (const icon of manifest.icons) {
    // oxlint-disable-next-line no-await-in-loop -- a few small files
    const served = await request.get(icon.src);
    expect(served.status(), icon.src).toBe(200);
    expect(served.headers()["content-type"], icon.src).toContain(icon.type);
  }

  await expect(page.locator('head meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-touch-icon.png",
  );
});
