// Opening a service (AC-18; FR-06.5, FR-06.6; DS-21, DS-25, DS-94, TS-43): the "Open in…" chooser lists only an
// album's services, in order, every time, each opening its page in a new tab; `O` opens it from the keyboard, or says
// an album has no links; on a phone-sized touch screen it is a bottom sheet; with the account's links set to open in
// the apps, the chooser and the inspector open the services' apps (TON-104); and a list's cards and rows name the
// album's services, each a link to it (TON-105). Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { streamingServices, type Album, type StreamingService } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, live, saved, toasts, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const spotify = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";
const tidal = "https://tidal.com/album/77654321";
const apple = "https://music.apple.com/us/album/1440783617";

/** An album in the list `name`, with links to these services. */
async function linked(
  page: Page,
  name: string,
  record: Album,
  urls: Partial<Record<StreamingService, string>>,
) {
  const list = await created(page, name);
  await added(page, [record], list.id);
  const rows = streamingServices.flatMap((service) => {
    const url = urls[service];
    return url === undefined ? [] : [{ albumId: record.id, service, url }];
  });
  await page.evaluate(async (links) => {
    const sync = window.tonarisSync;
    if (!sync) throw new Error("No sync client on the page.");
    await sync.links.insert(links).isPersisted.promise;
  }, rows);
  await page.goto(`/l/${list.id}`);
  await live(page);
  return list;
}

const rowOf = (page: Page, gridName: string, text: string) =>
  page.getByRole("grid", { name: gridName }).getByRole("row").filter({ hasText: text });

test("on desktop, the chooser lists only the album's services, each opening its page", async ({
  page,
}) => {
  await signIn(page, accounts.openDesktop);
  await live(page);
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await linked(page, "Grunge", bleach, { tidal, spotify });

  const row = rowOf(page, "Grunge", "Bleach");
  await expect(row.locator('[data-slot="service-link"]')).toHaveText(["Spotify", "Tidal"]);
  await row.hover();
  await row.getByRole("button", { name: "Open 'Bleach' in…" }).click();
  const chooser = page.getByRole("dialog", { name: "Open in…" });
  const choices = chooser.getByRole("link");
  await expect(choices).toHaveText(["Open in Spotify", "Open in Tidal"]);
  await expect(choices.first()).toBeFocused();
  await expect(choices.first()).toHaveAttribute("href", spotify);
  await expect(choices.first()).toHaveAttribute("target", "_blank");
  await expect(choices.nth(1)).toHaveAttribute("href", tidal);
  // The inspector didn't open: Open is the row's own action.
  await expect(page.getByRole("complementary", { name: "Album" })).toHaveCount(0);
});

test("O opens the chooser for the focused album, a single link still asks, and an album without links says so", async ({
  page,
}) => {
  await signIn(page, accounts.openKeys);
  await live(page);
  const nevermind = album("Nevermind", { artistCredit: "Nirvana", originalYear: 1991 });
  await linked(page, "Grunge", nevermind, { "apple-music": apple });
  await added(page, [album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 })]);
  const list = page.getByRole("grid", { name: "Grunge" });

  await rowOf(page, "Grunge", "Nevermind").getByRole("gridcell").nth(1).focus();
  await page.keyboard.press("o");
  const chooser = page.getByRole("dialog", { name: "Open in…" });
  await expect(chooser.getByRole("link")).toHaveText(["Open in Apple Music"]);
  await expect(chooser.getByRole("link")).toHaveAttribute("href", apple);
  await page.keyboard.press("Escape");
  await expect(chooser).toHaveCount(0);

  await page.goto("/unsorted");
  await live(page);
  await page
    .getByRole("grid", { name: "Unsorted" })
    .getByRole("row")
    .filter({ hasText: "Bleach" })
    .getByRole("gridcell")
    .nth(1)
    .focus();
  await page.keyboard.press("o");
  await expect(toasts(page).filter({ hasText: "'Bleach' has no links to open." })).toBeVisible();
  await expect(chooser).toHaveCount(0);
  await expect(list).toHaveCount(0);
});

test("with links set to open in the apps, the chooser and the inspector open the services' apps", async ({
  page,
}) => {
  await signIn(page, accounts.openApp);
  await live(page);
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  const list = await linked(page, "Grunge", bleach, { tidal, spotify });

  await page.goto("/settings/preferences");
  await live(page);
  const app = page
    .getByRole("radiogroup", { name: "Open links in" })
    .getByRole("radio", { name: "App" });
  await expect(
    page
      .getByRole("radiogroup", { name: "Open links in" })
      .getByRole("radio", { name: "Web page" }),
  ).toBeChecked();
  await app.click();
  await expect(app).toBeChecked();
  await saved(page);

  // The setting is the account's: it holds after a reload.
  await page.goto(`/l/${list.id}?album=${bleach.id}`);
  await live(page);
  const inspectorLink = page
    .getByRole("complementary", { name: "Album" })
    .getByRole("region", { name: "Links" })
    .getByRole("link", { name: /^Open in Tidal/ });
  await expect(inspectorLink).toHaveAttribute("href", "tidal://album/77654321");
  await expect(inspectorLink).not.toHaveAttribute("target", /./);

  const row = rowOf(page, "Grunge", "Bleach");
  await row.hover();
  await row.getByRole("button", { name: "Open 'Bleach' in…" }).click();
  const choices = page.getByRole("dialog", { name: "Open in…" }).getByRole("link");
  await expect(choices).toHaveText(["Open in Spotify", "Open in Tidal"]);
  await expect(choices.first()).toHaveAttribute("href", "spotify:album:1KQ1Pf4ikoK1jBbOtOHvOv");
  await expect(choices.nth(1)).toHaveAttribute("href", "tidal://album/77654321");
});

test("a list's cards and rows name the album's services, each opening it and not the album", async ({
  page,
}) => {
  await signIn(page, accounts.openList);
  await live(page);
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await linked(page, "Grunge", bleach, { tidal, spotify });
  await page.route("https://tidal.com/**", (route) => route.fulfill({ body: "Tidal" }));
  const inspector = page.getByRole("complementary", { name: "Album" });

  // Rows: the services column, its names links, each underlined and ending in ↗ (TON-125).
  const row = rowOf(page, "Grunge", "Bleach");
  const rowLinks = row.locator('[data-slot="service-link"]');
  await expect(rowLinks).toHaveText(["Spotify", "Tidal"]);
  await expect(rowLinks.locator("svg")).toHaveCount(2);
  await expect(rowLinks.first().locator("span")).toHaveCSS("text-decoration-line", "underline");
  const rowTidal = row.getByRole("link", { name: "Open 'Bleach' in Tidal" });
  await expect(rowTidal).toHaveAttribute("href", tidal);
  await expect(rowTidal).toHaveAttribute("tabindex", "-1");
  const [fromRow] = await Promise.all([page.waitForEvent("popup"), rowTidal.click()]);
  await expect(fromRow).toHaveURL(tidal);
  await fromRow.close();
  await expect(inspector).toHaveCount(0);

  // Cards: a line under the year.
  await page.getByRole("button", { name: "View", exact: true }).click();
  const options = page.getByRole("dialog", { name: "View options" });
  await options
    .getByRole("radiogroup", { name: "Layout" })
    .getByRole("radio", { name: "Grid" })
    .click();
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  const card = page
    .getByRole("grid", { name: "Grunge" })
    .getByRole("gridcell", { name: /^Bleach/ });
  await expect(card.locator('[data-slot="service-link"]')).toHaveText(["Spotify", "Tidal"]);
  await expect(card.getByRole("link", { name: "Open 'Bleach' in Spotify" })).toHaveAttribute(
    "href",
    spotify,
  );
  const [fromCard] = await Promise.all([
    page.waitForEvent("popup"),
    card.getByRole("link", { name: "Open 'Bleach' in Tidal" }).click(),
  ]);
  await expect(fromCard).toHaveURL(tidal);
  await fromCard.close();
  await expect(inspector).toHaveCount(0);
  expect(await violations(page, '[role="grid"]')).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the chooser is a bottom sheet of the canonical links, without app links", async ({
    page,
  }) => {
    await signIn(page, accounts.openMobile);
    await live(page);
    const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
    await linked(page, "Grunge", bleach, { spotify, tidal });

    await rowOf(page, "Grunge", "Bleach").getByRole("button", { name: "Open 'Bleach' in…" }).tap();
    const sheet = page.getByRole("dialog", { name: "Open in…" });
    await expect(sheet.getByRole("link")).toHaveText(["Open in Spotify", "Open in Tidal"]);
    await expect(sheet.getByRole("link", { name: "Open in Tidal" })).toHaveAttribute("href", tidal);
    await expect(sheet.getByRole("link", { name: /app$/ })).toHaveCount(0);
    // It sits at the bottom of the screen.
    const box = await sheet.boundingBox();
    expect(box && box.y + box.height).toBeGreaterThan(830);
    expect(box && box.y).toBeGreaterThan(422);
  });
});
