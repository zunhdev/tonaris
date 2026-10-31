// Opening shared content signed in (DS-70; FR-07.11, FR-07.17, FR-05.2; AC-16's shared part): view-only with the
// owner's pill and no edit controls; the viewer's sort kept for them after a reload and their own arrangement moved
// with ⌥↑, neither reaching the owner's views; the owner's saves appearing live; and "No longer available" once the
// owner removes access.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

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

async function signedIn(browser: Browser, address: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, address);
  await live(page);
  return page;
}

async function sortBy(page: Page, mode: "Name" | "Manual") {
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page
    .getByRole("dialog", { name: "View options" })
    .getByRole("radiogroup", { name: "Sort" })
    .getByRole("radio", { name: mode })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "View options" })).toHaveCount(0);
}

test("a viewer sees it view-only, in their own order, live, until access ends", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.viewingOwner);
  await live(page);
  const doom: Container = {
    id: uuidv7(),
    kind: "list",
    parentId: null,
    name: "Doom",
    description: null,
  };
  await insert(page, doom);
  await saved(page);
  const [nightfall, epicus, dreams] = [
    album("Nightfall", { originalYear: 1987 }),
    album("Epicus Doomicus Metallicus", { originalYear: 1986 }),
    album("Ancient Dreams", { originalYear: 1988 }),
  ];
  await added(page, [nightfall, epicus, dreams], doom.id);
  const spotify = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";
  await send(
    page,
    "link.set",
    { albumId: nightfall.id, service: "spotify", url: spotify },
    { url: null },
  );
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  const grantId = uuidv7();
  await send(page, "share.invite", {
    grantId,
    containerId: doom.id,
    email: accounts.viewingViewer,
  });

  const viewer = await signedIn(browser, accounts.viewingViewer);
  await send(viewer, "share.accept", { grantId });
  await viewer.goto("/shared");
  await live(viewer);
  await viewer.getByRole("link", { name: `"Doom"` }).click();
  await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("Doom");
  await expect(viewer.getByText("View only · Shared by Denis")).toBeVisible();
  // No editing: no mode toggle, no Share.
  await expect(viewer.getByRole("radiogroup", { name: "Mode" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Share" })).toHaveCount(0);
  const albums = viewer.getByRole("list", { name: "Albums in Doom" }).getByRole("listitem");
  await expect(albums).toHaveCount(3);
  // The account default: by year.
  await expect(albums.first()).toContainText("Epicus Doomicus Metallicus");
  expect(await violations(viewer, "main")).toEqual([]);
  // Its services are links, as in the album list, opening where the viewer's setting says (TON-127).
  await expect(
    albums
      .filter({ hasText: "Nightfall" })
      .getByRole("link", { name: "Open 'Nightfall' in Spotify" }),
  ).toHaveAttribute("href", spotify);

  // Sorted by name, kept after a reload.
  await sortBy(viewer, "Name");
  await expect(albums.first()).toContainText("Ancient Dreams");
  await viewer.reload();
  await live(viewer);
  await expect(albums.first()).toContainText("Ancient Dreams");

  // Their own arrangement: in the order added, then Ancient Dreams up one.
  await sortBy(viewer, "Manual");
  await expect(albums.first()).toContainText("Nightfall");
  const handle = viewer.getByRole("button", { name: "Move Ancient Dreams" });
  await handle.focus();
  await viewer.keyboard.press("Alt+ArrowUp");
  await expect(albums.nth(1)).toContainText("Ancient Dreams");
  await expect(handle).toBeFocused();
  await viewer.keyboard.press("Alt+Shift+ArrowUp");
  await expect(albums.first()).toContainText("Ancient Dreams");
  await saved(viewer);

  // None of it reached the owner's views.
  const owners = await (await page.request.get(`${apiUrl}/v1/sync/bootstrap`)).json();
  expect(owners.views).toEqual([]);
  expect(owners.positions).toEqual([]);

  // The owner's saves show without reloading; removing access ends it.
  await added(page, [album("Tales of Creation", { originalYear: 1989 })], doom.id);
  await expect(albums).toHaveCount(4);
  await send(page, "share.revoke", { grantId });
  await expect(viewer.getByRole("main")).toContainText("No longer available.");
});
