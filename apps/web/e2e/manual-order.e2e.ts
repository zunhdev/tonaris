// Manual order and moves in a real browser (FR-05.2–FR-05.4, FR-01.4, FR-01.5, FR-09.4; DS-49, DS-51): rearranging
// by keyboard, by dragging a row's handle and by dragging a card (TON-322), the hint under another sort, where new
// items land, rearranging being presentation only, moving folders and lists with M and by dragging onto the tree, and a
// move from another browser. Each test signs in with its own account.

import { bootstrapSchema, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Locator, type Page } from "./support/test";
import {
  added,
  album,
  announcements,
  chooseLayout,
  created,
  list,
  live,
  renameElsewhere,
  saved,
  violations,
  foldersAsRows,
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
    await window.tonarisSync?.memberships.delete(key).when("settled");
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
  // Folders as rows, which this test is about; cards are their default (TON-174).
  await foldersAsRows(page);
  const metal: Container = { ...list("Metal"), kind: "folder" };
  const funeral: Container = { ...list("Funeral"), kind: "folder", parentId: metal.id };
  const archive: Container = { ...list("Archive"), kind: "folder" };
  const doom = list("Doom");
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).when("settled");
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
  await expect(picker.getByRole("listbox", { name: "Folders" }).getByRole("option")).toHaveText([
    "Archive",
  ]);
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.press("Escape");
  // Keys pressed while a dialog is still closing are ignored, so the next M waits until it's gone.
  await expect(picker).toHaveCount(0);

  // M on the list Doom, into Metal: it keeps its album, and lands last.
  await tree.getByRole("treeitem", { name: /^Doom/ }).focus();
  await page.keyboard.press("m");
  await page
    .getByRole("dialog", { name: "Move 'Doom' to…" })
    .getByRole("option", { name: "Metal", exact: true })
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
  // Saved before the page reloads, so the root shows it.
  await saved(page);

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

test("albums dragged onto a list in the tree join it, and with ⌥ move there, with Undo (TON-229)", async ({
  page,
}) => {
  await signIn(page, accounts.albumDrag);
  await live(page);
  const doom = await created(page, "Doom");
  const stoner = await created(page, "Stoner");
  await added(page, [album("Dopesmoker"), album("Holy Mountain")], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  const tree = page.getByRole("tree");
  const target = tree.getByRole("treeitem", { name: /^Stoner/ });
  // In Editing mode, rows have handles in any sort: here, by year.
  await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();
  await expect(grid(page, "Doom").locator('[data-slot="drag-handle"]')).toHaveCount(2);

  // A drop adds it, and it stays in Doom.
  await rowOf(page, "Doom", "Dopesmoker").hover();
  await dragOver(
    page,
    rowOf(page, "Doom", "Dopesmoker").locator('[data-slot="drag-handle"]'),
    target,
  );
  await expect(page.getByText("Add to Stoner", { exact: true })).toBeVisible();
  await expect(target).toHaveClass(/bg-accent-soft/);
  await page.mouse.up();
  await expect(announcements(page).first()).toHaveText("Added Dopesmoker to Stoner");
  await expect(grid(page, "Doom").getByRole("row")).toHaveCount(3);
  await saved(page);

  // Over a list it is already in, nothing is highlighted, and a drop changes nothing.
  await rowOf(page, "Doom", "Dopesmoker").hover();
  await dragOver(
    page,
    rowOf(page, "Doom", "Dopesmoker").locator('[data-slot="drag-handle"]'),
    target,
  );
  await expect(target).not.toHaveClass(/bg-accent-soft/);
  await page.mouse.up();

  // With ⌥, it moves: out of Doom, into Stoner, with Undo.
  await rowOf(page, "Doom", "Holy Mountain").hover();
  await dragOver(
    page,
    rowOf(page, "Doom", "Holy Mountain").locator('[data-slot="drag-handle"]'),
    target,
  );
  await page.keyboard.down("Alt");
  await page.mouse.move(...(await centre(target)), { steps: 2 });
  await expect(page.getByText("Move to Stoner", { exact: true })).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(rowOf(page, "Doom", "Holy Mountain")).toHaveCount(0);
  const notifications = page.getByRole("region", { name: "Notifications" });
  await expect(notifications.getByText("Moved to Stoner")).toBeVisible();
  // dnd-kit stops clicks for 50 ms after a drop; the save takes longer.
  await saved(page);
  await notifications.getByRole("button", { name: "Undo" }).click();
  await expect(rowOf(page, "Doom", "Holy Mountain")).toHaveCount(1);
  await saved(page);

  await page.goto(`/l/${stoner.id}`);
  await live(page);
  await expect(grid(page, "Stoner").getByRole("row")).toHaveCount(2);
  await expect(rowOf(page, "Stoner", "Dopesmoker")).toHaveCount(1);
});

test("a drag onto the tree lights the folder under the pointer as rows move, its name chip where it was taken (TON-302)", async ({
  page,
}) => {
  await signIn(page, accounts.dragTarget);
  await live(page);
  const genres: Container = { ...list("Genres"), kind: "folder" };
  const folders = ["Blues", "Country", "Disco", "Folk", "Funk"].map((name): Container =>
    Object.assign(list(name), { kind: "folder" as const, parentId: genres.id }),
  );
  const doom: Container = { ...list("Doom"), parentId: genres.id };
  // Enough below them for the sidebar to scroll.
  const more = Array.from({ length: 16 }, (_, n) => list(`More ${String(n + 1).padStart(2, "0")}`));
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).when("settled");
    },
    [genres, ...folders, doom, ...more],
  );
  // Genres sorted by name, so a rename moves a folder among the others.
  await page.goto(`/f/${genres.id}`);
  await live(page);
  await chooseSort(page, "Name");
  // Saved before the page reloads, or the folder is back in manual order.
  await saved(page);
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto(`/l/${doom.id}`);
  await live(page);
  const tree = page.getByRole("tree");
  const item = (name: string) => tree.getByRole("treeitem", { name: new RegExp(`^${name}`) });
  const inGenres = tree.locator('[role="treeitem"][aria-level="2"]');
  await expect(inGenres).toHaveText(["Blues", "Country", "Disco", "Folk", "Funk", /^Doom/]);
  const lit = /bg-accent-soft/;

  // A rename saved in another browser mid-drag takes Blues to the end, and the folders below move up a row under
  // the pointer. The folder lit is the one now under it, Disco, not Country, which was.
  const [x, y] = await centre(item("Country"));
  await dragOver(page, item("Doom"), item("Country"));
  await expect(item("Country")).toHaveClass(lit);
  await renameElsewhere(page, folders[0]!.id, "Blues", "Zydeco");
  await expect(inGenres).toHaveText(["Country", "Disco", "Folk", "Funk", "Zydeco", /^Doom/]);
  await page.mouse.move(x, y + 2, { steps: 2 });
  await expect(item("Disco")).toHaveClass(lit);
  await expect(item("Country")).not.toHaveClass(lit);
  await page.keyboard.press("Escape");
  await page.mouse.up();

  // The sidebar scrolls after Doom is pressed and before the drag starts, 6 px on, as a wheel turned just before the
  // press does in Chromium: the chip with its name stays where the pointer took the row, its middle, and not where
  // the row went.
  const viewport = page
    .getByRole("navigation", { name: "Sidebar" })
    .locator('[data-slot="scroll-area-viewport"]');
  await viewport.evaluate((element) => element.scrollTo({ top: 0 }));
  const [dx, dy] = await centre(item("Doom"));
  const half = ((await item("Doom").boundingBox())?.height ?? 0) / 2;
  await page.mouse.move(dx, dy);
  await page.mouse.down();
  await viewport.evaluate((element) => element.scrollBy({ top: 100 }));
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(100);
  await page.mouse.move(dx, dy + 10, { steps: 3 });
  // dnd-kit counts the pointer from the move after the one that starts the drag.
  await page.mouse.move(dx, dy + 12);
  const chip = page.locator('[data-slot="drag-overlay"]');
  await expect(chip).toContainText("Doom");
  await expect
    .poll(async () => Math.round((await chip.boundingBox())?.y ?? 0))
    .toBe(Math.round(dy + 12 - half));
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("a drag held near the sidebar's edge scrolls the tree, by whole pixels, which Safari keeps in step (TON-303)", async ({
  page,
}) => {
  // Scrolls by a fraction of a pixel, which Safari rounded where the page keeps the list but not where it paints it,
  // so the two drifted apart and the pointer hovered rows above the one under it.
  await page.addInitScript(() => {
    const fractions: number[] = [];
    Object.assign(window, { fractionalScrolls: fractions });
    // On HTMLElement, in front of Element's own, which it hands each call on to.
    Object.defineProperty(HTMLElement.prototype, "scrollBy", {
      configurable: true,
      value(this: HTMLElement, first?: ScrollToOptions | number, second?: number) {
        const [x, y] =
          typeof first === "number" ? [first, second ?? 0] : [first?.left ?? 0, first?.top ?? 0];
        if (!Number.isInteger(y)) fractions.push(y);
        Element.prototype.scrollBy.call(this, x, y);
      },
    });
  });
  await signIn(page, accounts.dragEdge);
  await live(page);
  const tops = Array.from({ length: 30 }, (_, n) =>
    Object.assign(list(`Genre ${String(n + 1).padStart(2, "0")}`), { kind: "folder" as const }),
  );
  const rock: Container = { ...list("Rock"), kind: "folder" };
  const bands = Array.from({ length: 30 }, (_, n) =>
    Object.assign(list(`Band ${String(n + 1).padStart(2, "0")}`), { parentId: rock.id }),
  );
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).when("settled");
    },
    [...tops, rock, ...bands],
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/l/${bands[20]!.id}`);
  await live(page);
  const item = page.getByRole("tree").getByRole("treeitem", { name: /^Band 21/ });
  await expect(item).toBeVisible();
  const viewport = page
    .getByRole("navigation", { name: "Sidebar" })
    .locator('[data-slot="scroll-area-viewport"]');
  const offset = () => viewport.evaluate((element) => element.scrollTop);
  const from = await offset();
  const box = await viewport.boundingBox();
  if (!box) throw new Error("No sidebar to drag in.");

  // Held at the top edge, the tree scrolls up; let go of it, it stays put.
  const [x, y] = await centre(item);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 10, { steps: 3 });
  await page.mouse.move(x, box.y + 8, { steps: 10 });
  await expect.poll(offset).toBeLessThan(from - 100);
  await page.mouse.move(x, box.y + box.height / 2, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.evaluate(() => Reflect.get(window, "fractionalScrolls"))).toEqual([]);
});

async function centre(locator: Locator): Promise<[number, number]> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Nothing to point at.");
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** Starts dragging `from` and holds it over `to`, the button still down. */
async function dragOver(page: Page, from: Locator, to: Locator): Promise<void> {
  const [x, y] = await centre(from);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 10, { steps: 3 });
  await page.mouse.move(...(await centre(to)), { steps: 12 });
}

/** A grid's cards' titles, or folders' and lists' names, in order (TON-322). */
const cardNames = (page: Page, name: string) =>
  grid(page, name).locator('[data-slot="card-title"]');
const cardOf = (page: Page, gridName: string, name: string) =>
  grid(page, gridName).getByRole("gridcell", { name: new RegExp(`^${name}`) });
const editMode = (page: Page) =>
  page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();

/** Where in `locator` a share of its width (`x`) and height (`y`) falls. */
async function pointIn(locator: Locator, x: number, y = 0.4): Promise<[number, number]> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Nothing to point at.");
  return [box.x + box.width * x, box.y + box.height * y];
}

/** Takes hold of a card in the middle, as a person would, and holds it at `to`, the button still down. */
async function holdCard(page: Page, card: Locator, to: [number, number]): Promise<void> {
  const [x, y] = await centre(card);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y, { steps: 3 });
  await page.mouse.move(...to, { steps: 12 });
}

test("album cards are rearranged by dragging them, in manual order and Editing mode (TON-322)", async ({
  page,
}) => {
  await signIn(page, accounts.cardDrag);
  await live(page);
  const doom = await created(page, "Doom");
  await added(
    page,
    [album("Nightfall"), album("Ancient Dreams"), album("Tales of Creation")],
    doom.id,
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await chooseLayout(page, "Grid");
  await chooseSort(page, "Manual");
  await expect(cardNames(page, "Doom")).toHaveText([
    "Nightfall",
    "Ancient Dreams",
    "Tales of Creation",
  ]);

  // In Viewing mode, a card doesn't drag.
  await holdCard(
    page,
    cardOf(page, "Doom", "Tales of Creation"),
    await pointIn(cardOf(page, "Doom", "Nightfall"), 0.2),
  );
  await expect(page.locator('[data-slot="drag-overlay"]')).toHaveCount(0);
  await page.mouse.up();
  await expect(cardNames(page, "Doom")).toHaveText([
    "Nightfall",
    "Ancient Dreams",
    "Tales of Creation",
  ]);

  // In Editing mode, it lands left of the card whose left half it is dropped on, a line showing where.
  await editMode(page);
  await holdCard(
    page,
    cardOf(page, "Doom", "Tales of Creation"),
    await pointIn(cardOf(page, "Doom", "Nightfall"), 0.2),
  );
  await expect(page.locator('[data-slot="drag-overlay"]')).toContainText("Tales of Creation");
  await expect(cardOf(page, "Doom", "Nightfall").locator('[data-slot="drop-line"]')).toHaveClass(
    /-left-/,
  );
  await page.mouse.up();
  await expect(cardNames(page, "Doom")).toHaveText([
    "Tales of Creation",
    "Nightfall",
    "Ancient Dreams",
  ]);
  await expect(announcements(page).first()).toHaveText(
    "Moved Tales of Creation to position 1 of 3",
  );

  // Dropped in the gap after the second card, it lands there.
  const second = await cardOf(page, "Doom", "Nightfall").boundingBox();
  if (!second) throw new Error("No second card.");
  await holdCard(page, cardOf(page, "Doom", "Tales of Creation"), [
    second.x + second.width + 5,
    second.y + second.height * 0.4,
  ]);
  await expect(cardOf(page, "Doom", "Nightfall").locator('[data-slot="drop-line"]')).toHaveClass(
    /-right-/,
  );
  await page.mouse.up();
  await expect(cardNames(page, "Doom")).toHaveText([
    "Nightfall",
    "Tales of Creation",
    "Ancient Dreams",
  ]);

  // A click still opens the album, and moves nothing.
  await saved(page);
  await cardOf(page, "Doom", "Ancient Dreams").click();
  await expect(page.getByRole("complementary", { name: "Album" })).toBeVisible();
  await expect(cardNames(page, "Doom")).toHaveText([
    "Nightfall",
    "Tales of Creation",
    "Ancient Dreams",
  ]);

  await page.reload();
  await live(page);
  await expect(cardNames(page, "Doom")).toHaveText([
    "Nightfall",
    "Tales of Creation",
    "Ancient Dreams",
  ]);
});

test("folder and list cards are rearranged by dragging them, and move when dropped onto the tree (TON-322)", async ({
  page,
}) => {
  await signIn(page, accounts.folderCardDrag);
  await live(page);
  const metal: Container = { ...list("Metal"), kind: "folder" };
  const doom = list("Doom");
  const later = list("Later");
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).when("settled");
    },
    [metal, doom, later],
  );
  // The root shows cards in manual order by default (TON-174): creation order until arranged.
  await page.goto("/c");
  await live(page);
  await expect(cardNames(page, "Collection")).toHaveText(["Metal", "Doom", "Later"]);
  await editMode(page);

  // Dropped on the right half of 'Metal', 'Later' comes right after it.
  await holdCard(
    page,
    cardOf(page, "Collection", "Later"),
    await pointIn(cardOf(page, "Collection", "Metal"), 0.8),
  );
  await page.mouse.up();
  await expect(cardNames(page, "Collection")).toHaveText(["Metal", "Later", "Doom"]);
  await expect(announcements(page).first()).toHaveText("Moved Later to position 2 of 3");

  // Dropped on a folder in the tree, 'Doom' moves into it.
  const tree = page.getByRole("tree");
  await holdCard(
    page,
    cardOf(page, "Collection", "Doom"),
    await centre(tree.getByRole("treeitem", { name: /^Metal/ })),
  );
  await expect(tree.getByRole("treeitem", { name: /^Metal/ })).toHaveClass(/bg-accent-soft/);
  await page.mouse.up();
  await expect(announcements(page).first()).toHaveText("Moved Doom to Metal");
  await expect(cardNames(page, "Collection")).toHaveText(["Metal", "Later"]);
});

test("an album card dragged onto a list in the tree joins it, in any sort (TON-322)", async ({
  page,
}) => {
  await signIn(page, accounts.cardOntoList);
  await live(page);
  const doom = await created(page, "Doom");
  const stoner = await created(page, "Stoner");
  await added(page, [album("Dopesmoker"), album("Holy Mountain")], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  // Sorted by year, as lists are until chosen otherwise.
  await chooseLayout(page, "Grid");
  await editMode(page);
  const target = page.getByRole("tree").getByRole("treeitem", { name: /^Stoner/ });
  await holdCard(page, cardOf(page, "Doom", "Dopesmoker"), await centre(target));
  await expect(page.getByText("Add to Stoner", { exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(announcements(page).first()).toHaveText("Added Dopesmoker to Stoner");
  // It stays in Doom too.
  await expect(cardNames(page, "Doom")).toHaveCount(2);
  await saved(page);

  await page.goto(`/l/${stoner.id}`);
  await live(page);
  await expect(grid(page, "Stoner").getByRole("row")).toHaveCount(2);
});
