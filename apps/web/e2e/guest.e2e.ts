// A shared link's page in a real browser, as a guest (DS-72; FR-06.5, FR-07.11, FR-11.9; AC-26): rendered on the
// server, a folder opening into its list, the service links leaving with no referrer, view options kept for the
// visit only, the owner's saves arriving live, preview tags, and the unavailable sentence once the link is off.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
});

async function send(
  page: Page,
  name: string,
  args: Record<string, unknown>,
  base?: Record<string, unknown>,
) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name, args, ...(base ? { base } : {}) },
  });
  const body = await response.json();
  expect(body.outcome?.status, JSON.stringify(body)).toBe("confirmed");
}

test("a guest browses a shared folder, live, with the visit's own view", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.guestOwner);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  await insert(page, metal, doom);
  await saved(page);
  const nightfall = album("Nightfall", { originalYear: 1987 });
  const epicus = album("Epicus Doomicus Metallicus", { originalYear: 1986 });
  await added(page, [nightfall, epicus], doom.id);
  await send(
    page,
    "link.set",
    {
      albumId: nightfall.id,
      service: "spotify",
      url: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
    },
    { url: null },
  );
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  await send(page, "share.setLink", { containerId: metal.id, linkId: uuidv7(), enabled: true });
  const settings = await (
    await page.request.get(`${apiUrl}/v1/containers/${metal.id}/sharing`)
  ).json();
  const url: string = settings.link.url;
  const path = new URL(url).pathname;

  // Rendered on the server: the HTML already holds the share (TS-03), with text-only preview tags.
  const html = await (await page.request.get(path)).text();
  expect(html).toContain("Metal");
  expect(html).toContain("Shared by Denis");
  expect(html).toContain(`property="og:title" content="Metal"`);
  expect(html).toContain(`content="Shared by Denis · 2 albums"`);
  expect(html).not.toContain(`og:image`);

  const guest = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  // The page is rendered on the server, where the CSP refuses style attributes; it must need none (TON-126).
  const refused: string[] = [];
  guest.on("console", (message) => {
    if (/Content Security Policy/.test(message.text())) refused.push(message.text());
  });
  const response = await guest.goto(path);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText("Metal");
  await guest.getByRole("link", { name: "Doom" }).click();
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText("Doom");
  await expect(guest).toHaveURL(new RegExp(`\\?c=${doom.id}$`));
  const albums = guest.getByRole("list", { name: "Albums in Doom" }).getByRole("listitem");
  await expect(albums).toHaveCount(2);
  // By year first, DS-44's default.
  await expect(albums.first()).toContainText("Epicus Doomicus Metallicus");
  expect(await violations(guest, "main")).toEqual([]);
  // The stylesheets it links are the ones the build wrote (TON-126), and the artwork tiles get their hues.
  const hrefs = await guest
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const sheets = await Promise.all(hrefs.map((href) => guest.request.get(href)));
  expect(sheets.length).toBeGreaterThan(0);
  for (const sheet of sheets) {
    expect(sheet.ok(), sheet.url()).toBe(true);
    expect(sheet.headers()["content-type"]).toContain("text/css");
  }
  await expect(albums.first().locator("span").first()).toHaveAttribute("style", /background/);

  // Its services are links, as in the album list, which take focus and leave with no referrer (TON-127).
  const spotify = albums
    .filter({ hasText: "Nightfall" })
    .getByRole("link", { name: "Open 'Nightfall' in Spotify" });
  await expect(spotify).toHaveText("Spotify");
  await expect(spotify.locator("svg")).toBeVisible();
  await expect(spotify).toHaveAttribute(
    "href",
    "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
  );
  await expect(spotify).toHaveAttribute("rel", "noopener noreferrer");
  await expect(spotify).toHaveAttribute("target", "_blank");
  await expect(spotify).not.toHaveAttribute("tabindex", "-1");
  await expect(albums.filter({ hasText: "Epicus" }).getByRole("link")).toHaveCount(0);
  await expect(guest.getByRole("button", { name: /in…$/ })).toHaveCount(0);

  // View options last the visit: kept on reload, never saved.
  await expect(guest.getByRole("main")).toContainText(
    "Your view settings aren't saved — sign in to keep them.",
  );
  await guest.getByRole("radio", { name: "Name" }).click();
  await expect(albums.first()).toContainText("Epicus Doomicus Metallicus");
  await guest.getByRole("radio", { name: "Descending" }).click();
  await expect(albums.first()).toContainText("Nightfall");
  // A grid's cards keep their size: artwork as wide as the card, then the words (TON-126).
  await guest.getByRole("radio", { name: "Grid" }).click();
  const boxes = await Promise.all((await albums.all()).map((card) => card.boundingBox()));
  for (const box of boxes) expect(box && box.height > box.width, JSON.stringify(box)).toBe(true);
  await expect(
    albums
      .filter({ hasText: "Nightfall" })
      .getByRole("link", { name: "Open 'Nightfall' in Spotify" }),
  ).toBeVisible();
  await guest.getByRole("radio", { name: "Rows" }).click();
  expect(refused).toEqual([]);
  await guest.reload();
  await expect(albums.first()).toContainText("Nightfall");
  const fresh = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  await fresh.goto(`${path}?c=${doom.id}`);
  await expect(
    fresh.getByRole("list", { name: "Albums in Doom" }).getByRole("listitem").first(),
  ).toContainText("Epicus Doomicus Metallicus");

  // On a phone, a row with links shows them on a third line, under the artist; one without stays 56px (TON-127).
  const phone = await (
    await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
    })
  ).newPage();
  await phone.goto(`${path}?c=${doom.id}`);
  const phoneRows = phone.getByRole("list", { name: "Albums in Doom" }).getByRole("listitem");
  const linked = phoneRows.filter({ hasText: "Nightfall" });
  await expect(linked.getByRole("link", { name: "Open 'Nightfall' in Spotify" })).toBeVisible();
  expect((await linked.boundingBox())?.height).toBeGreaterThan(56);
  expect((await phoneRows.filter({ hasText: "Epicus" }).boundingBox())?.height).toBe(56);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // The owner's saves arrive live (FR-07.11).
  await added(page, [album("Ancient Dreams", { originalYear: 1988 })], doom.id);
  await expect(albums).toHaveCount(3);

  // Turned off, the link shows only that it isn't available.
  await send(page, "share.setLink", { containerId: metal.id, linkId: uuidv7(), enabled: false });
  await expect(guest.getByRole("main")).toContainText(
    "This link isn't available. Ask the person who shared it for a new one.",
  );
});
