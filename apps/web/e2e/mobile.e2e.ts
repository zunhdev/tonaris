// DS-110's mobile web on the phone profiles (TON-103; AC-42, Q-03): `iphone` (WebKit) and `pixel` (Chromium) run
// this file alone. A phone browses by drilling down: a top bar with Back, the name, Search and Account; the root's
// folders and lists, then Unsorted; Mine and Shared switching the root (TON-134); 56 px album rows; an album in a
// read-only sheet with its links; view options in a bottom sheet; Trash and custom fields left to the desktop; the
// path from the top bar's name (TON-153); pull to refresh in an iPhone Home Screen app (TON-139); and a list opened
// from far down a folder opening at its top (TON-157).

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  added,
  album,
  insert,
  list,
  live,
  pageFaded,
  saved,
  webOrigin,
  foldersAsRows,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const spotify = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";

/** The folder Metal holding the list Doom, with Dopesmoker linked to Spotify; Holy Mountain in Unsorted. */
async function seeded(page: Page) {
  const metal: Container = { ...list("Metal"), kind: "folder" };
  const doom: Container = { ...list("Doom"), parentId: metal.id };
  const dopesmoker = album("Dopesmoker", { artistCredit: "Sleep", originalYear: 1999 });
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).when("settled");
    },
    [metal, doom],
  );
  await added(page, [dopesmoker], doom.id);
  await added(page, [album("Holy Mountain", { artistCredit: "Sleep", originalYear: 1992 })]);
  await page.evaluate(
    async (link) => {
      await window.tonarisSync?.links.insert(link).when("settled");
    },
    { albumId: dopesmoker.id, service: "spotify" as const, url: spotify },
  );
  return { metal, doom, dopesmoker };
}

/**
 * axe's findings on the page, once a page switch's fade is over. Base UI's focus guards are left out: in Safari it
 * gives the invisible sentinels that keep focus inside a dialog `role="button"`, for VoiceOver, which axe reads as
 * unnamed buttons (TON-93 checks them).
 */
const axe = async (page: Page) => {
  await pageFaded(page);
  return (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .exclude("[data-base-ui-focus-guard]")
      .analyze()
  ).violations.map((violation) => violation.id);
};

/** Where something is on the page, once it is there. */
const boxOf = async (part: Locator) => (await part.boundingBox())!;

test("a phone browses by drilling down, and opens an album in a sheet", async ({ page }) => {
  await signIn(page, accounts.phone);
  await live(page);
  // Folders as rows, which this test is about; cards are their default (TON-174).
  await foldersAsRows(page);
  await seeded(page);
  await page.goto("/c");
  await live(page);

  // No sidebar: the top bar has the name, Search and Account.
  await expect(page.getByRole("heading", { level: 1, name: "Collection" })).toBeVisible();
  await expect(page.getByRole("tree")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Account: / })).toBeVisible();
  // Its avatar, not a person icon: the first letter of the account's name, here the email's (TON-169).
  await expect(
    page.getByRole("button", { name: /^Account: / }).locator('[data-slot="avatar"]'),
  ).toHaveAttribute("data-letter", "P");
  // The top bar is sticky and opaque, or an iOS 26 Home Screen app blurs it (TON-135).
  const bar = await page
    .locator("header")
    .first()
    .evaluate((header) => {
      const style = getComputedStyle(header);
      return { position: style.position, background: style.backgroundColor };
    });
  expect(bar.position).toBe("sticky");
  expect(bar.background).not.toMatch(/rgba\(.*, 0\)|transparent/);
  const more = page.getByRole("navigation", { name: "More" });
  await expect(more.getByRole("link")).toHaveText([/Unsorted\s*1/]);
  await expect(page.getByRole("radio", { name: "Mine" })).toBeChecked();
  expect(await axe(page)).toEqual([]);

  // The account menu is wide enough for its items, each one line and a 44 px target, inside the screen (TON-152).
  await page.getByRole("button", { name: /^Account: / }).click();
  const items = page.getByRole("menu").getByRole("menuitem");
  await expect(items).toHaveText([
    "Settings",
    "Feedback and ideas",
    "Terms of use",
    "Privacy notice",
    "Sign out",
  ]);
  // Once its opening zoom is over.
  const boxes = async () =>
    Promise.all((await items.all()).map(async (item) => (await item.boundingBox())!));
  await expect
    .poll(async () => (await boxes()).map((box) => Math.round(box.height)))
    .toEqual([44, 44, 44, 44, 44]);
  const width = page.viewportSize()?.width ?? 0;
  for (const box of await boxes()) expect(box.x + box.width).toBeLessThanOrEqual(width);
  // One line of `text.base` (22 px), not two.
  const labels = await items.evaluateAll((elements) =>
    elements.map((element) => {
      const text = document.createRange();
      text.selectNode([...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)!);
      return text.getBoundingClientRect().height;
    }),
  );
  for (const height of labels) expect(height).toBeLessThan(30);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // A row is one cell of two lines, 56 px: a long name takes the full width and ends in an ellipsis at the row's
  // edge, with the count under it (TON-156, TON-184). The link is named by the name, and described by the count.
  const periodName = "1 Классический период русского рока, 80-е и 90-е годы";
  await insert(page, { ...list(periodName), kind: "folder" });
  const grid = page.getByRole("grid", { name: "Collection" });
  await expect(grid).toHaveAttribute("aria-colcount", "1");
  const periodRow = grid.getByRole("row").filter({ hasText: "Классический период" });
  const periodLink = periodRow.getByRole("link", { name: periodName, exact: true });
  await expect(periodLink).toHaveAccessibleDescription("0 folders and lists");
  await expect(periodRow.getByRole("gridcell")).toHaveCount(1);
  const rowBox = await boxOf(periodRow);
  const linkBox = await boxOf(periodLink);
  const nameBox = await boxOf(periodRow.getByText(periodName));
  const countBox = await boxOf(periodRow.getByText("0 folders and lists"));
  expect(rowBox.height).toBe(56);
  // The link fills the row, inside its 8 px padding, and the name runs to the link's edge.
  expect(Math.round(linkBox.x + linkBox.width)).toBe(Math.round(rowBox.x + rowBox.width - 8));
  expect(Math.round(nameBox.x + nameBox.width)).toBe(Math.round(linkBox.x + linkBox.width));
  expect(countBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
  expect(
    await periodRow.getByText(periodName).evaluate((name) => name.scrollWidth > name.clientWidth),
  ).toBe(true);

  // A tap on the count opens the folder too.
  await page.getByText("1 folder or list", { exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Metal" })).toBeVisible();
  await page.getByRole("link", { name: "Doom" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Doom" })).toBeVisible();

  // A 56 px row with the artist under the title, and nothing wider than the screen.
  const row = page
    .getByRole("grid", { name: "Doom" })
    .getByRole("row")
    .filter({ hasText: "Dopesmoker" });
  await expect(row).toContainText("Sleep");
  expect((await row.boundingBox())?.height).toBe(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await axe(page)).toEqual([]);

  await row.getByText("Dopesmoker").click();
  const sheet = page.getByRole("complementary", { name: "Album" });
  await expect(sheet.getByRole("button", { name: "Close album" })).toBeFocused();
  await expect(sheet.getByRole("link", { name: /^Open in Spotify/ })).toHaveAttribute(
    "href",
    spotify,
  );
  // Read-only: nothing to edit on a phone. Its facts are under Properties (TON-173).
  await expect(sheet.getByRole("button", { name: /^Edit|Replace|Remove/ })).toHaveCount(0);
  await expect(sheet.getByRole("region", { name: "Properties" })).toContainText(
    "Original release year",
  );
  expect(await axe(page)).toEqual([]);
  await sheet.getByRole("button", { name: "Close album" }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: "Back to Metal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Metal" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Collection" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Collection" })).toBeVisible();
});

test("view options are a bottom sheet, and Trash and custom fields stay on the desktop", async ({
  page,
}) => {
  await signIn(page, accounts.phoneOptions);
  await live(page);
  await seeded(page);
  await page.goto("/unsorted");
  await live(page);

  await page.getByRole("button", { name: "View options" }).click();
  const options = page.getByRole("dialog", { name: "View options" });
  await expect(options).toBeVisible();
  // At the bottom of the screen, once its opening animation is over.
  const height = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await options.boundingBox();
      return box && Math.round(box.y + box.height);
    })
    .toBe(height);
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");

  await page.goto("/trash");
  await expect(page.getByText("Trash is on the desktop app.")).toBeVisible();
  await page.goto("/settings/custom-fields");
  await expect(page.getByText("Setting up custom fields is on the desktop app.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Custom fields" }),
  ).toHaveCount(0);
});

test("search fills the screen and opens what it finds", async ({ page }) => {
  await signIn(page, accounts.phoneSearch);
  await live(page);
  await seeded(page);
  await page.goto("/c");
  await live(page);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Search" });
  await page.getByRole("combobox", { name: "Search" }).fill("doom");
  await palette.getByRole("option", { name: /Doom/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Doom" })).toBeVisible();

  // Phones view only (X-04): the palette offers going somewhere and views, and no edit (DRIFT-089).
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("combobox", { name: "Search" }).fill(">");
  await expect(palette.getByRole("option", { name: /Go to Collection/ })).toBeVisible();
  for (const edit of [/Add albums from links/, /New list/, /Delete/, /Add to list/])
    // oxlint-disable-next-line no-await-in-loop
    await expect(palette.getByRole("option", { name: edit })).toHaveCount(0);
});

test("Settings' choices are 44 px targets on a phone (DS-15, DRIFT-093)", async ({ page }) => {
  await signIn(page, accounts.phoneTargets);
  await page.goto("/settings/preferences");
  const radios = page.getByRole("main").getByRole("radio");
  await expect(radios.first()).toBeVisible();
  const heights = await radios.evaluateAll((each) =>
    each.map((radio) => radio.getBoundingClientRect().height),
  );
  expect(heights.every((height) => height >= 40)).toBe(true);
});

/** Sends a mutation as the page's account. */
async function send(page: Page, name: string, args: Record<string, unknown>) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name, args },
  });
  expect((await response.json()).outcome?.status).toBe("confirmed");
}

test("Mine and Shared switch the Collection screen, and Back from a share returns to Shared", async ({
  page,
  browser,
}) => {
  // The viewer signs in first, so the sign-in email is their only one. Anna shares Road trip with them, which they
  // accept, and invites them to Later, still pending.
  await signIn(page, accounts.phoneViewer);
  await live(page);
  const anna = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  await signIn(anna, accounts.phoneSharer);
  await live(anna);
  const [trip, later] = [list("Road trip"), list("Later")];
  await insert(anna, trip, later);
  await saved(anna);
  await send(anna, "account.setDisplayName", { displayName: "Anna" });
  const [tripGrant, laterGrant] = [uuidv7(), uuidv7()];
  await send(anna, "share.invite", {
    grantId: tripGrant,
    containerId: trip.id,
    email: accounts.phoneViewer,
  });
  await send(anna, "share.invite", {
    grantId: laterGrant,
    containerId: later.id,
    email: accounts.phoneViewer,
  });
  await send(page, "share.accept", { grantId: tripGrant });
  await page.goto("/c");
  await live(page);

  // Mine first, with Unsorted; the switch is a 44 px target.
  const shared = page.getByRole("radio", { name: "Shared · 1" });
  await expect(page.getByRole("radio", { name: "Mine" })).toBeChecked();
  expect((await shared.boundingBox())?.height).toBeGreaterThanOrEqual(40);
  await expect(page.getByRole("navigation", { name: "More" })).toBeVisible();

  // Shared: the pending invitation first, then what's shared, with its owner; no Unsorted and no View options.
  await shared.click();
  await expect(page).toHaveURL(/\/c\?show=shared$/);
  await expect(page.getByRole("link", { name: "1 invitation" })).toBeVisible();
  const trips = page.getByRole("list", { name: "Shared with me" }).getByRole("link");
  await expect(trips).toHaveText([/Road trip\s*Anna/]);
  await expect(page.getByRole("navigation", { name: "More" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View options" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await axe(page)).toEqual([]);

  // A share opens, and its Back returns to Shared.
  await trips.first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Road trip" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Collection" }).click();
  await expect(page).toHaveURL(/\/c\?show=shared$/);
  await expect(shared).toBeChecked();

  // The device remembers Shared, until Mine is chosen.
  await page.goto("/c");
  await live(page);
  await expect(shared).toBeChecked();
  await page.getByRole("radio", { name: "Mine" }).click();
  await expect(page).toHaveURL(/\/c$/);
  await expect(page.getByRole("navigation", { name: "More" })).toBeVisible();
});

test("two levels down, the name opens the path, in the person's own folders and in a share", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.phonePath);
  await live(page);
  const anna = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  await signIn(anna, accounts.phonePathSharer);
  await live(anna);
  const { metal, doom } = await seeded(page);
  // Anna shares Trips, holding Europe, holding Road trip.
  const trips: Container = { ...list("Trips"), kind: "folder" };
  const europe: Container = { ...list("Europe"), kind: "folder", parentId: trips.id };
  const road: Container = { ...list("Road trip"), parentId: europe.id };
  await insert(anna, trips, europe, road);
  await saved(anna);
  await send(anna, "account.setDisplayName", { displayName: "Anna" });
  const grantId = uuidv7();
  await send(anna, "share.invite", { grantId, containerId: trips.id, email: accounts.phonePath });
  await send(page, "share.accept", { grantId });

  // One level down the name is plain, since Back already goes to Collection.
  await page.goto(`/f/${metal.id}`);
  await live(page);
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Metal");
  await expect(title.getByRole("button")).toHaveCount(0);

  // Two levels down it opens the path: Collection, then the folder above, each a 44 px target.
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await expect(page.getByRole("heading", { level: 1, name: "Doom" })).toBeVisible();
  await title.getByRole("button", { name: "Doom" }).click();
  const path = page.getByRole("menu", { name: "Path" });
  await expect(path.getByRole("menuitem")).toHaveText(["Collection", "Metal"]);
  await expect
    .poll(async () => Math.round((await path.getByRole("menuitem").first().boundingBox())!.height))
    .toBe(44);
  expect(await axe(page)).toEqual([]);
  await path.getByRole("menuitem", { name: "Collection" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Collection" })).toBeVisible();
  await expect(page).toHaveURL(/\/c$/);

  // In a share: Collection on Shared, then the share's folders above.
  await page.goto(`/shared/${trips.id}?c=${road.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Road trip" })).toBeVisible();
  await title.getByRole("button", { name: "Road trip" }).click();
  await expect(path.getByRole("menuitem")).toHaveText(["Collection", "Trips", "Europe"]);
  await path.getByRole("menuitem", { name: "Trips" }).click();
  await expect(title).toHaveText("Trips");
  await expect(title.getByRole("button")).toHaveCount(0);
  await page.goto(`/shared/${trips.id}?c=${road.id}`);
  await title.getByRole("button", { name: "Road trip" }).click();
  await path.getByRole("menuitem", { name: "Collection" }).click();
  await expect(page).toHaveURL(/\/c\?show=shared$/);
  await expect(page.getByRole("radio", { name: "Shared · 1" })).toBeChecked();
});

test("in an iPhone Home Screen app, pulling down at the top shows a spinner, and far enough reloads", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "pixel",
    "the touch drag uses Chromium's DevTools protocol",
  );
  await signIn(page, accounts.phonePull);
  await live(page);
  const spinner = page.locator('[data-slot="pull-to-refresh"]');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: 180, y }],
    });

  // In a browser, the browser's own pull applies: Tonaris adds none.
  await touch("touchStart", 200);
  await touch("touchMove", 400);
  await expect(spinner).toHaveCount(0);
  await touch("touchEnd", 400);

  // As a Home Screen app, which only iOS marks with `navigator.standalone`.
  await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  await page.reload();
  await live(page);
  await page.evaluate(() => Object.assign(window, { beforePull: true }));

  // A short pull brings the spinner, and letting go springs it back without reloading.
  await touch("touchStart", 200);
  await touch("touchMove", 260);
  await expect(spinner).toBeVisible();
  await touch("touchEnd", 260);
  await expect(spinner).toHaveCount(0);
  expect(await page.evaluate(() => "beforePull" in window)).toBe(true);

  // A pull past the threshold reloads.
  await touch("touchStart", 200);
  await touch("touchMove", 300);
  await touch("touchMove", 360);
  await Promise.all([page.waitForEvent("load"), touch("touchEnd", 360)]);
  await live(page);
  expect(await page.evaluate(() => "beforePull" in window)).toBe(false);
});

test("a list's cards label a live album, open a link by tap, and leave no hover behind", async ({
  page,
}) => {
  await signIn(page, accounts.phoneCards);
  await live(page);
  const doom = list("Doom");
  await insert(page, doom);
  const roadburn = album("Live at Roadburn", {
    isLive: true,
    originalYear: 2011,
    recordingYearStart: 2010,
  });
  await added(page, [roadburn, album("Nightfall", { originalYear: 1987 })], doom.id);
  await page.evaluate(
    async (link) => {
      await window.tonarisSync?.links.insert(link).when("settled");
    },
    { albumId: roadburn.id, service: "spotify" as const, url: spotify },
  );
  await page
    .context()
    .route("https://open.spotify.com/**", (route) => route.fulfill({ body: "Spotify" }));
  await page.goto(`/l/${doom.id}`);
  await live(page);

  await page.getByRole("button", { name: "View options" }).click();
  const options = page.getByRole("dialog", { name: "View options" });
  await options
    .getByRole("radiogroup", { name: "Layout" })
    .getByRole("radio", { name: "Grid" })
    .click();
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);

  // The live album's cover says so; the studio album's says nothing; nothing is wider than the screen (TON-167).
  const cards = page.getByRole("grid", { name: "Doom" });
  const card = cards.getByRole("gridcell", { name: /^Live at Roadburn/ });
  await expect(card.locator('[data-slot="release-label"]')).toHaveText("Live");
  await expect(
    cards.getByRole("gridcell", { name: /^Nightfall/ }).locator('[data-slot="release-label"]'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await axe(page)).toEqual([]);

  // A tap on the link opens Spotify rather than the album's sheet, and leaves no raised surface: a phone's pointer
  // doesn't hover, so the card's hover never applies.
  expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
  const [opened] = await Promise.all([
    page.waitForEvent("popup"),
    card.getByRole("link", { name: "Open 'Live at Roadburn' in Spotify" }).tap(),
  ]);
  await expect(opened).toHaveURL(spotify);
  await opened.close();
  await expect(page.getByRole("complementary", { name: "Album" })).toHaveCount(0);
  expect(
    await card.evaluate((element) => getComputedStyle(element, "::before").backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");

  // Collection's folders and lists are cards too, fanning their covers, two to a row (TON-174).
  await page.goto("/c");
  await live(page);
  const doomCard = page
    .getByRole("grid", { name: "Collection" })
    .getByRole("link", { name: /^Doom/ });
  await expect(doomCard.locator('[data-slot="cover-fan-cover"]')).toHaveCount(2);
  await expect(doomCard).toContainText("2 albums");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a list opened from far down a folder opens at its top, and Back returns to where the folder was", async ({
  page,
}) => {
  await signIn(page, accounts.phoneScrolled);
  await live(page);
  // Folders as rows, which this test is about; cards are their default (TON-174).
  await foldersAsRows(page);
  const shelf: Container = { ...list("Shelf"), kind: "folder" };
  const lists = Array.from({ length: 30 }, (_, n) => ({
    ...list(`Shelf ${String(n + 1).padStart(2, "0")}`),
    parentId: shelf.id,
  }));
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).when("settled");
    },
    [shelf, ...lists],
  );
  const last = lists.at(-1)!;
  await added(
    page,
    Array.from({ length: 30 }, (_, n) => album(`Record ${n + 1}`)),
    last.id,
  );
  await page.goto(`/f/${shelf.id}`);
  await live(page);
  const view = page.locator('[data-page-scroll="view"]');
  const offset = () => view.evaluate((element) => element.scrollTop);

  // The router once gave the list the folder's offset, its scroll container being in the same place.
  await view.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(offset).toBeGreaterThan(0);
  const down = await offset();
  await page.getByRole("link", { name: last.name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: last.name })).toBeVisible();
  await pageFaded(page);
  expect(await offset()).toBe(0);

  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Shelf" })).toBeVisible();
  await expect.poll(offset).toBe(down);
});
