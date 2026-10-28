// The search palette in a real browser (FR-12.1, FR-12.2, FR-12.4, FR-12.5; DS-75, AC-25 for owned content): ⌘K
// from a text field and the sidebar's Search item; results grouped, located and highlighted in the original spelling;
// "Show all"; Trash and descriptions left out; opening folders, lists and albums, on their own with ⌘Enter; and the
// full-screen sheet on a narrow screen. Each test has its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, toasts, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
  description: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description });
const palette = (page: Page) => page.getByRole("dialog", { name: "Search" });
const field = (page: Page) => page.getByRole("combobox", { name: "Search" });
const group = (page: Page, name: string) => palette(page).getByRole("group", { name, exact: true });
const item = (page: Page, name: string) =>
  page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}`) });

test("results are grouped, located and highlighted; Trash and descriptions aren't searched", async ({
  page,
}) => {
  await signIn(page, accounts.searchResults);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id, "heavy and slow");
  const classic = container("list", "Classic Doom");
  const favorites = container("list", "Favorites");
  const grunge = container("folder", "Grunge");
  const nineties = container("list", "90s", grunge.id);
  const sludge = container("list", "Sludge");
  await insert(page, metal, doom, classic, favorites, grunge, nineties, sludge);
  await saved(page);
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await added(page, [bleach], nineties.id);
  await page.evaluate(
    async (entry) => {
      await window.tonarisSync?.memberships.insert(entry).isPersisted.promise;
    },
    { listId: favorites.id, albumId: bleach.id, addedAt: new Date().toISOString() },
  );
  await added(page, [album("Homogenic", { artistCredit: "Björk", originalYear: 1997 })]);
  await added(
    page,
    Array.from({ length: 10 }, (_, n) => album(`Epicus ${n + 1}`)),
    doom.id,
  );
  // Sludge goes to Trash.
  await item(page, "Sludge").focus();
  await page.keyboard.press("Backspace");
  await expect(toasts(page).filter({ hasText: "1 list moved to Trash" })).toBeVisible();
  await saved(page);

  // ⌘K works from a text field.
  await page.goto("/trash");
  await live(page);
  await page.getByRole("textbox", { name: "Filter by name" }).focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(field(page)).toBeFocused();
  await expect(palette(page)).toContainText(
    "Search folder and list names, album titles and artists.",
  );

  // Lists by how the name matches, each with where it is.
  await field(page).fill("doom");
  const lists = group(page, "Lists").getByRole("option");
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(0)).toContainText("Doom");
  await expect(lists.nth(0)).toContainText("Metal");
  await expect(lists.nth(1)).toContainText("Classic Doom");
  await expect(lists.nth(1)).toContainText("Collection");
  await expect(group(page, "Folders")).toHaveCount(0);
  await expect(lists.nth(0)).toHaveAttribute("aria-selected", "true");

  // Accent-insensitive, highlighted in the original spelling.
  await field(page).fill("bjork");
  const homogenic = group(page, "Albums").getByRole("option");
  await expect(homogenic).toHaveCount(1);
  await expect(homogenic.locator("mark")).toHaveText("Björk");
  await expect(homogenic).toContainText("Homogenic");
  await expect(homogenic).toContainText("1997");
  await expect(homogenic).toContainText("Unsorted");

  // An album in two lists shows the first path, and how many more.
  await field(page).fill("nirv");
  await expect(group(page, "Albums").getByRole("option")).toContainText("Favorites +1 more");

  // Descriptions and Trash aren't searched.
  await field(page).fill("heavy");
  await expect(palette(page)).toContainText("No results for 'heavy'.");
  await field(page).fill("sludge");
  await expect(palette(page)).toContainText("No results for 'sludge'.");

  // Up to 8 a group, then "Show all".
  await field(page).fill("candlemass");
  const albums = group(page, "Albums").getByRole("option");
  await expect(albums).toHaveCount(9);
  await expect(albums.nth(8)).toHaveText("Show all 10");
  expect(await violations(page, '[data-slot="command-content"]')).toEqual([]);
  await page.keyboard.press("ArrowUp");
  await expect(albums.nth(8)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(albums).toHaveCount(10);
  await expect(albums.nth(8)).toHaveAttribute("aria-selected", "true");

  // Esc closes it, and ⌘K opens it again.
  await page.keyboard.press("Escape");
  await expect(palette(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toHaveCount(0);
});

test("results open where they are, an album on its own with ⌘Enter; a narrow screen gets the whole screen", async ({
  page,
}) => {
  await signIn(page, accounts.searchOpening);
  await live(page);
  const grunge = container("folder", "Grunge");
  const nineties = container("list", "90s", grunge.id);
  await insert(page, grunge, nineties);
  await saved(page);
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  const homogenic = album("Homogenic", { artistCredit: "Björk", originalYear: 1997 });
  await added(page, [bleach], nineties.id);
  await added(page, [homogenic]);
  const inspector = page.getByRole("complementary", { name: "Album" });

  // The sidebar's Search item opens it.
  await page.getByRole("button", { name: /^Search/ }).click();
  await field(page).fill("grunge");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/f/${grunge.id}`);
  await expect(palette(page)).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("90");
  await group(page, "Lists").getByRole("option", { name: /90s/ }).click();
  await expect(page).toHaveURL(`/l/${nineties.id}`);
  await expect(palette(page)).toHaveCount(0);

  // An album opens in its list, with the inspector.
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("bleach");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/l/${nineties.id}?album=${bleach.id}`);
  await expect(inspector.getByRole("heading", { name: "Bleach" })).toBeVisible();
  await expect(palette(page)).toHaveCount(0);

  // One in no list opens in Unsorted.
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("homogenic");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/unsorted?album=${homogenic.id}`);
  await expect(inspector.getByRole("heading", { name: "Homogenic" })).toBeVisible();
  await expect(palette(page)).toHaveCount(0);

  // ⌘Enter opens it on its own.
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("bleach");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page).toHaveURL(`/a/${bleach.id}`);
  await expect(palette(page)).toHaveCount(0);

  // Below 768px it fills the screen, once its opening animation is over.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(field(page)).toBeFocused();
  await expect
    .poll(() => palette(page).boundingBox())
    .toEqual({ x: 0, y: 0, width: 390, height: 844 });
});
