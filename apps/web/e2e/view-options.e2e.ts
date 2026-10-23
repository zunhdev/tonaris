// Sorting, grouping and View options in a real browser (FR-05.1, FR-05.5–FR-05.10, FR-11.7, FR-11.8; DS-24,
// DS-42–DS-44, DS-49, DS-92, DS-94): the chronological year and its display, sorts and directions, release-type
// groups, manual order before arranging, choices remembered per view and synced to another browser, account defaults
// in Settings → Preferences, the root and the tree in the same sort, and a layout kept on the device moving to the
// account. Each test signs in with its own account.

import { expect, test, type Locator, type Page } from "@playwright/test";

import { bootstrapSchema, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, list, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const grid = (page: Page, name: string) => page.getByRole("grid", { name });
/** The grid's album rows: not the hidden header, nor group headers. */
const albumRows = (page: Page, name: string) =>
  grid(page, name)
    .getByRole("row")
    .filter({ hasNot: page.getByRole("columnheader") })
    .filter({ hasNot: page.getByRole("button") });
/** The titles of the grid's albums, in order. */
const titles = (page: Page, name: string) => albumRows(page, name).locator('[data-cell$=":0"]');
const groupHeaders = (page: Page, name: string) => grid(page, name).getByRole("button");
const viewOptions = (page: Page) => page.getByRole("dialog", { name: "View options" });

async function openViewOptions(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(viewOptions(page)).toBeVisible();
  return viewOptions(page);
}

/** Chooses `option` for the choice `choice` in a View options popover or on Preferences. */
async function choose(scope: Locator, choice: string, option: string): Promise<void> {
  const radio = scope
    .getByRole("radiogroup", { name: choice })
    .getByRole("radio", { name: option });
  await radio.click();
  await expect(radio).toBeChecked();
}

const fallbackText = "Recording year unknown — sorted by release year";

/** Two albums, new each time: an album is in a list at most once. */
const pair = () => [
  album("Nightfall", { originalYear: 1987 }),
  album("Ancient Dreams", { originalYear: 1988 }),
];

test("albums sort by their chronological year or name, and group by release type", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, accounts.orderViews);
  await live(page);
  const sabbath = await created(page, "Sabbath");
  const values = { artistCredit: "Black Sabbath" };
  await added(
    page,
    [
      album("Heaven and Hell", { ...values, originalYear: 1980 }),
      album("Live at the Rainbow", {
        ...values,
        isLive: true,
        originalYear: 1984,
        recordingYearStart: 1978,
        recordingYearEnd: 1982,
      }),
      album("Live Evil", { ...values, isLive: true, releaseType: "ep", originalYear: 1982 }),
      album("Neon Knights", { ...values, releaseType: null, originalYear: 1980 }),
      album("The Best Of", { ...values, releaseType: "compilation", originalYear: 1985 }),
    ],
    sabbath.id,
  );

  // DS-44's first-time default: chronological ascending, by recording year for live albums (AC-14).
  await page.goto(`/l/${sabbath.id}`);
  await live(page);
  await expect(titles(page, "Sabbath")).toHaveText([
    "LLive at the Rainbow",
    "HHeaven and Hell",
    "NNeon Knights",
    "LLive Evil",
    "TThe Best Of",
  ]);
  const yearOf = (row: number) => albumRows(page, "Sabbath").nth(row).getByRole("gridcell").nth(2);
  await expect(yearOf(0)).toHaveText("rec. 1978–1982");
  await expect(yearOf(1)).toHaveText("1980");
  await expect(yearOf(3)).toHaveText(`1982 · ${fallbackText}`);
  await yearOf(3).locator("svg").hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(fallbackText);

  // By name, descending.
  const options = await openViewOptions(page);
  await expect(options.getByRole("radio", { name: "Year" })).toBeChecked();
  await choose(options, "Sort", "Name");
  await choose(options, "Direction", "Descending");
  await expect(titles(page, "Sabbath")).toHaveText([
    "TThe Best Of",
    "NNeon Knights",
    "LLive Evil",
    "LLive at the Rainbow",
    "HHeaven and Hell",
  ]);

  // Grouped by release type, the sort is kept within each group (AC-15).
  await choose(options, "Grouping", "Release type");
  await expect(options.getByRole("radio", { name: "Name" })).toBeChecked();
  await expect(options.getByRole("radio", { name: "Descending" })).toBeChecked();
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(viewOptions(page)).toBeHidden();
  await expect(groupHeaders(page, "Sabbath")).toHaveText([
    "Album1 album",
    "Live2 albums",
    "Compilation1 album",
    "Unclassified1 album",
  ]);
  await expect(titles(page, "Sabbath")).toHaveText([
    "HHeaven and Hell",
    "LLive Evil",
    "LLive at the Rainbow",
    "TThe Best Of",
    "NNeon Knights",
  ]);
  // Each group's albums start right under its 28 px header, also under the one stuck at the top.
  const albumHeader = await groupHeaders(page, "Sabbath").first().boundingBox();
  const firstAlbum = await albumRows(page, "Sabbath").first().boundingBox();
  expect(albumHeader?.height).toBe(28);
  expect(firstAlbum && albumHeader && firstAlbum.y - (albumHeader.y + albumHeader.height)).toBe(0);
  // The type column goes while grouped by type (DS-21).
  await expect(grid(page, "Sabbath")).toHaveAttribute("aria-colcount", "4");
  expect(await violations(page, '[role="grid"]')).toEqual([]);

  // A collapsed group keeps its header, also after a reload in the tab.
  const liveGroup = groupHeaders(page, "Sabbath").filter({ hasText: "Live" });
  await liveGroup.click();
  await expect(liveGroup).toHaveAttribute("aria-expanded", "false");
  await expect(titles(page, "Sabbath")).toHaveText([
    "HHeaven and Hell",
    "TThe Best Of",
    "NNeon Knights",
  ]);
  await page.reload();
  await live(page);
  await expect(liveGroup).toHaveAttribute("aria-expanded", "false");
  await liveGroup.press("Enter");
  await expect(liveGroup).toHaveAttribute("aria-expanded", "true");

  // Manual order before arranging is the order albums were added, the same grouped and combined (FR-05.8).
  await page.keyboard.press("v");
  await choose(viewOptions(page), "Sort", "Manual");
  await expect(viewOptions(page).getByRole("radio", { name: "Descending" })).toBeDisabled();
  await expect(titles(page, "Sabbath")).toHaveText([
    "HHeaven and Hell",
    "LLive at the Rainbow",
    "LLive Evil",
    "TThe Best Of",
    "NNeon Knights",
  ]);
  await choose(viewOptions(page), "Grouping", "None");
  await expect(titles(page, "Sabbath")).toHaveText([
    "HHeaven and Hell",
    "LLive at the Rainbow",
    "LLive Evil",
    "NNeon Knights",
    "TThe Best Of",
  ]);
});

test("choices are remembered per view and synced, and defaults apply where none was made", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.syncViews);
  await live(page);
  const doom = await created(page, "Doom");
  const later = await created(page, "Later");
  await added(page, pair(), doom.id);
  await added(page, pair(), later.id);

  // Another browser, signed in to the same account, has Doom open.
  const otherContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await otherContext.newPage();
  await signIn(other, accounts.syncViews);
  await other.goto(`/l/${doom.id}`);
  await live(other);
  await expect(titles(other, "Doom")).toHaveText(["NNightfall", "AAncient Dreams"]);

  await page.goto(`/l/${doom.id}`);
  await live(page);
  await choose(await openViewOptions(page), "Sort", "Name");
  await expect(titles(page, "Doom")).toHaveText(["AAncient Dreams", "NNightfall"]);
  await expect(titles(other, "Doom")).toHaveText(["AAncient Dreams", "NNightfall"]);
  await other.goto(`/l/${later.id}`);
  await expect(titles(other, "Later")).toHaveText(["NNightfall", "AAncient Dreams"]);
  await otherContext.close();

  // Doom chooses Year itself; Later never chose anything.
  await choose(viewOptions(page), "Sort", "Year");
  await expect(titles(page, "Doom")).toHaveText(["NNightfall", "AAncient Dreams"]);
  await page.keyboard.press("Escape");

  // Settings: from the account menu to Preferences, and G then S.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL("/settings/preferences");
  const settings = page.getByRole("navigation", { name: "Settings" });
  await expect(settings.getByRole("link", { name: "Preferences" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const lists = page.getByRole("region", { name: "Lists and Unsorted" });
  await expect(lists.getByRole("radio", { name: "Year" })).toBeChecked();
  await choose(lists, "Sort", "Name");
  expect(await violations(page, "main")).toEqual([]);
  await saved(page);

  // The default applies to Later, and Doom keeps its own choice (AC-16).
  await page.goto(`/l/${later.id}`);
  await expect(titles(page, "Later")).toHaveText(["AAncient Dreams", "NNightfall"]);
  await page.goto(`/l/${doom.id}`);
  await expect(titles(page, "Doom")).toHaveText(["NNightfall", "AAncient Dreams"]);

  // Back to the defaults.
  const doomOptions = await openViewOptions(page);
  await doomOptions.getByRole("button", { name: "Use account defaults" }).click();
  await expect(titles(page, "Doom")).toHaveText(["AAncient Dreams", "NNightfall"]);
  await expect(doomOptions.getByRole("button", { name: "Use account defaults" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Unsorted's grouping, saved as the default, groups Later too.
  await added(page, [album("Samarithan", { releaseType: null })]);
  await page.goto("/unsorted");
  const unsorted = await openViewOptions(page);
  await choose(unsorted, "Grouping", "Release type");
  await unsorted.getByRole("button", { name: "Save as my default" }).click();
  await expect(unsorted.getByRole("button", { name: "Save as my default" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await saved(page);
  await page.goto(`/l/${later.id}`);
  await expect(groupHeaders(page, "Later")).toHaveText(["Album2 albums"]);

  await page.keyboard.press("g");
  await page.keyboard.press("s");
  await expect(page).toHaveURL("/settings/preferences");
  await expect(lists.getByRole("radio", { name: "Release type" })).toBeChecked();
  await settings.getByRole("link", { name: "Connections" }).click();
  await expect(page).toHaveURL("/settings/connections");
  await expect(settings.getByRole("link", { name: "Connections" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the root sorts folders first, the tree follows it, and Created shows the dates", async ({
  page,
}) => {
  await signIn(page, accounts.sortFolders);
  await live(page);
  const later = list("Later");
  const metal: Container = { ...list("Metal"), kind: "folder" };
  const archive: Container = { ...list("Archive"), kind: "folder" };
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).isPersisted.promise;
    },
    [later, metal, archive],
  );
  const tree = page.getByRole("tree");
  const topLevel = tree.locator('[role="treeitem"][aria-level="1"]');
  const rootNames = () => grid(page, "Collection").getByRole("link");

  // Manual order before arranging is creation order, one mixed sequence (DS-44).
  await page.goto("/c");
  await live(page);
  await expect(rootNames()).toHaveText(["Later", "Metal", "Archive"]);
  await expect(topLevel.first()).toContainText("Later");

  const options = await openViewOptions(page);
  await expect(options.getByRole("radio", { name: "Manual" })).toBeChecked();
  await expect(options.getByRole("radiogroup", { name: "Grouping" })).toHaveCount(0);
  await choose(options, "Sort", "Name");
  await expect(rootNames()).toHaveText(["Archive", "Metal", "Later"]);
  await expect(topLevel.nth(0)).toContainText("Archive");
  await expect(topLevel.nth(1)).toContainText("Metal");
  await expect(topLevel.nth(2)).toContainText("Later");

  // By creation date: folders first, each with its date.
  await choose(options, "Sort", "Created");
  await page.keyboard.press("Escape");
  await expect(rootNames()).toHaveText(["Metal", "Archive", "Later"]);
  const today = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date());
  await expect(
    grid(page, "Collection").getByRole("row").filter({ hasText: "Metal" }).getByRole("gridcell"),
  ).toHaveText(["Metal", today, "0 folders and lists"]);
  expect(await violations(page, '[role="grid"]')).toEqual([]);
});

test("a Grid kept on the device becomes the view's saved layout", async ({ page }) => {
  await signIn(page, accounts.seedLayout);
  await live(page);
  const doom = await created(page, "Doom");
  await added(page, [album("Nightfall")], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  // Rows: the album's row and the hidden header row.
  await expect(grid(page, "Doom")).toHaveAttribute("aria-rowcount", "2");

  // As TON-34 kept it on this device.
  const key = await page.evaluate((listId) => {
    const lastView = Object.keys(localStorage).find((each) =>
      each.startsWith("tonaris:last-view:"),
    );
    const accountId = lastView?.slice("tonaris:last-view:".length) ?? "";
    const layouts = `tonaris:layouts:${accountId}`;
    localStorage.setItem(layouts, JSON.stringify({ [listId]: "grid" }));
    return layouts;
  }, doom.id);
  await page.reload();
  await live(page);
  await expect(grid(page, "Doom").getByRole("gridcell", { name: /^Nightfall/ })).toBeVisible();
  // Cards: one row of them.
  await expect(grid(page, "Doom")).toHaveAttribute("aria-rowcount", "1");
  expect(await page.evaluate((layouts) => localStorage.getItem(layouts), key)).toBeNull();
  await expect(async () => {
    const response = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
    const { views } = bootstrapSchema.parse(await response.json());
    expect(views).toEqual([
      { viewKey: doom.id, sortMode: null, sortDir: null, grouped: null, layout: "grid" },
    ]);
  }).toPass();
});
