// Manual order and moves in a real browser (FR-05.2–FR-05.4, FR-01.4, FR-01.5, FR-09.4; DS-49, DS-51): rearranging
// by keyboard and by dragging a row's handle, the hint under another sort, where new items land, rearranging being
// presentation only, moving folders and lists with M and by dragging onto the tree, and a move from another browser.
// Each test signs in with its own account.

import { expect, test, type Locator, type Page } from "@playwright/test";

import { bootstrapSchema, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  added,
  album,
  announcements,
  created,
  list,
  live,
  saved,
  violations,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const grid = (page: Page, name: string) => page.getByRole("grid", { name });
/** The titles of the grid's albums, or the names of its folders and lists, in order. */
const names = (page: Page, name: string) =>
  grid(page, name)
    .getByRole("row")
    .filter({ hasNot: page.getByRole("columnheader") })
    .filter({ hasNot: page.getByRole("button") })
    .locator('[data-cell$=":0"]');
const viewOptions = (page: Page) => page.getByRole("dialog", { name: "View options" });

async function chooseSort(page: Page, sort: string): Promise<void> {
  await page.getByRole("button", { name: "View", exact: true }).click();
  const radio = viewOptions(page)
    .getByRole("radiogroup", { name: "Sort" })
    .getByRole("radio", { name: sort });
  await radio.click();
  await expect(radio).toBeChecked();
  await page.keyboard.press("Escape");
}

/** The account's positions as the API has them. */
async function savedPositions(page: Page) {
  const response = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
  return bootstrapSchema.parse(await response.json()).positions;
}

test("albums are rearranged by keyboard in manual order, announced and kept", async ({ page }) => {
  await signIn(page, accounts.arrangeKeys);
  await live(page);
  const doom = await created(page, "Doom");
  await added(
    page,
    [album("Nightfall"), album("Ancient Dreams"), album("Tales of Creation")],
    doom.id,
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);

  // Under the year sort, ⌥↑ offers manual order instead of moving.
  const third = names(page, "Doom").nth(2);
  await expect(names(page, "Doom")).toHaveText([
    "AAncient Dreams",
    "NNightfall",
    "TTales of Creation",
  ]);
  await third.click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(names(page, "Doom")).toHaveText([
    "AAncient Dreams",
    "NNightfall",
    "TTales of Creation",
  ]);
  await page.getByRole("button", { name: "Switch to manual order" }).click();
  // Manual order before arranging is the order they were added.
  await expect(names(page, "Doom")).toHaveText([
    "NNightfall",
    "AAncient Dreams",
    "TTales of Creation",
  ]);

  await names(page, "Doom").nth(2).click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(names(page, "Doom")).toHaveText([
    "NNightfall",
    "TTales of Creation",
    "AAncient Dreams",
  ]);
  await expect(announcements(page).first()).toHaveText(
    "Moved Tales of Creation to position 2 of 3",
  );
  // Focus follows the album.
  await expect(names(page, "Doom").nth(1)).toBeFocused();
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect(names(page, "Doom")).toHaveText([
    "TTales of Creation",
    "NNightfall",
    "AAncient Dreams",
  ]);
  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect(names(page, "Doom")).toHaveText([
    "NNightfall",
    "AAncient Dreams",
    "TTales of Creation",
  ]);

  await saved(page);
  await page.reload();
  await live(page);
  await expect(names(page, "Doom")).toHaveText([
    "NNightfall",
    "AAncient Dreams",
    "TTales of Creation",
  ]);
  await expect.poll(async () => (await savedPositions(page)).length).toBeGreaterThan(0);
});

/** Drags `from` (a handle or a tree item) by the pointer to `to`, at `y` within it (a share of its height). */
async function drag(page: Page, from: Locator, to: Locator, y = 0.5): Promise<void> {
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  if (!start || !end) throw new Error("Nothing to drag, or nowhere to drop.");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 10, { steps: 3 });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height * y, { steps: 12 });
  await page.mouse.up();
}

const rowOf = (page: Page, gridName: string, name: string) =>
  grid(page, gridName).getByRole("row").filter({ hasText: name });

test("a row is rearranged by dragging its handle, in manual order and Editing mode", async ({
  page,
}) => {
  await signIn(page, accounts.arrangeDrag);
  await live(page);
  const doom = await created(page, "Doom");
  await added(
    page,
    [album("Nightfall"), album("Ancient Dreams"), album("Tales of Creation")],
    doom.id,
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);
  // Sorted by year, rows have no handle.
  await expect(grid(page, "Doom").locator('[data-slot="drag-handle"]')).toHaveCount(0);
  await chooseSort(page, "Manual");
  // Handles show in Editing mode (DS-45).
  await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();
  await expect(grid(page, "Doom").locator('[data-slot="drag-handle"]')).toHaveCount(3);
  expect(await violations(page, '[role="grid"]')).toEqual([]);

  const handle = rowOf(page, "Doom", "Tales of Creation").locator('[data-slot="drag-handle"]');
  await rowOf(page, "Doom", "Tales of Creation").hover();
  await drag(page, handle, rowOf(page, "Doom", "Nightfall"), 0.2);
  await expect(names(page, "Doom")).toHaveText([
    "TTales of Creation",
    "NNightfall",
    "AAncient Dreams",
  ]);
  await expect(announcements(page).first()).toHaveText(
    "Moved Tales of Creation to position 1 of 3",
  );
  await saved(page);
  await page.reload();
  await live(page);
  await expect(names(page, "Doom")).toHaveText([
    "TTales of Creation",
    "NNightfall",
    "AAncient Dreams",
  ]);
});

test("new items take DS-51's places, and rearranging changes no list or parent", async ({
  page,
}) => {
  await signIn(page, accounts.arrangePlaces);
  await live(page);
  const doom = await created(page, "Doom");
  const nightfall = album("Nightfall");
  await added(page, [album("Ancient Dreams"), album("Tales of Creation")]);
  await added(page, [nightfall], doom.id);

  // Unsorted arranged by keyboard: the older album to the top.
  await page.goto("/unsorted");
  await live(page);
  await chooseSort(page, "Manual");
  await expect(names(page, "Unsorted")).toHaveText(["TTales of Creation", "AAncient Dreams"]);
  await names(page, "Unsorted").nth(1).click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(names(page, "Unsorted")).toHaveText(["AAncient Dreams", "TTales of Creation"]);
  // Rearranging Unsorted put nothing in a list.
  const before = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
  expect(bootstrapSchema.parse(await before.json()).memberships).toHaveLength(1);

  // An album leaving its last list arrives at the top of Unsorted (DS-51).
  await page.evaluate(async (key) => {
    await window.tonarisSync?.memberships.delete(key).isPersisted.promise;
  }, `${doom.id}:${nightfall.id}`);
  await expect(names(page, "Unsorted")).toHaveText([
    "NNightfall",
    "AAncient Dreams",
    "TTales of Creation",
  ]);

  // A list as a ranking: arranged, then a new album lands at its end.
  const later = await created(page, "Later");
  await added(page, [album("Epicus"), album("Dactylis Glomerata")], later.id);
  await page.goto(`/l/${later.id}`);
  await live(page);
  await chooseSort(page, "Manual");
  await names(page, "Later").nth(1).click();
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect(names(page, "Later")).toHaveText(["DDactylis Glomerata", "EEpicus"]);
  await added(page, [album("Candlemass")], later.id);
  await expect(names(page, "Later")).toHaveText(["DDactylis Glomerata", "EEpicus", "CCandlemass"]);
});

test("folders and lists move with M and by dragging onto the tree, and the root keeps parents when rearranged", async ({
  page,
}) => {
  await signIn(page, accounts.arrangeMoves);
  await live(page);
  const metal: Container = { ...list("Metal"), kind: "folder" };
  const funeral: Container = { ...list("Funeral"), kind: "folder", parentId: metal.id };
  const archive: Container = { ...list("Archive"), kind: "folder" };
  const doom = list("Doom");
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).isPersisted.promise;
    },
    [metal, funeral, archive, doom],
  );
  await added(page, [album("Nightfall")], doom.id);
  await page.goto("/c");
  await live(page);
  const tree = page.getByRole("tree");

  // The picker offers only places that can take the folder: not itself, under it, or where it is.
  await tree.getByRole("treeitem", { name: /^Metal/ }).focus();
  await page.keyboard.press("m");
  const picker = page.getByRole("dialog", { name: "Move 'Metal' to…" });
  await expect(picker.getByRole("list", { name: "Places" }).getByRole("button")).toHaveText([
    "Archive",
  ]);
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.press("Escape");

  // M on the list Doom, into Metal: it keeps its album, and lands last.
  await tree.getByRole("treeitem", { name: /^Doom/ }).focus();
  await page.keyboard.press("m");
  await page
    .getByRole("dialog", { name: "Move 'Doom' to…" })
    .getByRole("button", { name: "Metal" })
    .click();
  await expect(announcements(page).first()).toHaveText("Moved Doom to Metal");
  await expect(tree.getByRole("treeitem", { name: /^Doom/ })).toHaveAttribute("aria-level", "2");
  await page.goto(`/f/${metal.id}`);
  await expect(names(page, "Metal")).toHaveText(["Funeral", "Doom"]);
  await expect(rowOf(page, "Metal", "Doom")).toContainText("1 album");

  // Funeral dragged onto Collection moves to the root.
  await drag(
    page,
    tree.getByRole("treeitem", { name: /^Funeral/ }),
    page
      .getByRole("navigation", { name: "Sidebar" })
      .getByRole("link", { name: "Collection", exact: true }),
  );
  await expect(tree.getByRole("treeitem", { name: /^Funeral/ })).toHaveAttribute("aria-level", "1");

  // Unarranged, the root holds Funeral in creation order. Rearranging it moves no folder or list, and the tree
  // follows the new order.
  await page.goto("/c");
  await expect(names(page, "Collection")).toHaveText(["Metal", "Funeral", "Archive"]);
  await names(page, "Collection").nth(2).focus();
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect(names(page, "Collection")).toHaveText(["Archive", "Metal", "Funeral"]);
  await expect(tree.locator('[role="treeitem"][aria-level="1"]').first()).toContainText("Archive");
  const snapshot = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
  const parents = bootstrapSchema
    .parse(await snapshot.json())
    .containers.map((each) => [each.name, each.parentId]);
  expect(parents).toContainEqual(["Doom", metal.id]);
  expect(parents).toContainEqual(["Funeral", null]);
});

test("a move made in another browser shows without reloading", async ({ page, browser }) => {
  await signIn(page, accounts.arrangeSync);
  await live(page);
  const doom = await created(page, "Doom");
  await added(page, [album("Nightfall"), album("Ancient Dreams")], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await chooseSort(page, "Manual");

  const otherContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await otherContext.newPage();
  await signIn(other, accounts.arrangeSync);
  await other.goto(`/l/${doom.id}`);
  await live(other);
  await expect(names(other, "Doom")).toHaveText(["NNightfall", "AAncient Dreams"]);

  await names(page, "Doom").nth(1).click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(names(other, "Doom")).toHaveText(["AAncient Dreams", "NNightfall"]);
  await otherContext.close();
});
