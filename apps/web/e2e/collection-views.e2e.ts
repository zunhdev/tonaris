// The collection views in a real browser (FR-05, DS-21–DS-23, DS-40, DS-41, DS-106, DS-115): albums as rows or
// cards (switched in View options, DS-49), folders and lists as rows, walked as ARIA grids by keyboard, and 5,000
// albums kept smooth by virtualization. With MEASURE_SCROLL=1, the 5,000-album test also measures scrolling, frame by frame, and prints it;
// run it headed (`--headed`), since headless Chromium paces frames irregularly even when idle. Each test signs in
// with its own account.

import { expect, type Locator, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  added,
  album,
  chooseLayout,
  created,
  insert,
  list,
  live,
  violations,
  webOrigin,
  foldersAsRows,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const grid = (page: Page, name: string) => page.getByRole("grid", { name });
/** The grid's data rows: every row but the hidden header. */
const rows = (page: Page, name: string) =>
  grid(page, name)
    .getByRole("row")
    .filter({ hasNot: page.getByRole("columnheader") });

test("a list's albums show as rows in chronological order, or as cards kept per view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, accounts.viewsList);
  await live(page);
  const doom = await created(page, "Doom");
  const epicus = album("Epicus Doomicus Metallicus", { originalYear: 1986 });
  await added(
    page,
    [
      album("Nightfall", { originalYear: 1987 }),
      album("Live in Stockholm", { isLive: true, originalYear: 1990, recordingYearStart: 1988 }),
      epicus,
      album("Tales of Creation", { originalYear: 1989, releaseType: "ep" }),
      album("Dactylis Glomerata", { originalYear: 1998 }),
    ],
    doom.id,
  );
  await added(page, [album("Ancient Dreams", { originalYear: 1988 })]);

  await page.goto(`/l/${doom.id}`);
  await live(page);
  await expect(grid(page, "Doom")).toHaveAttribute("aria-rowcount", "6");
  await expect(rows(page, "Doom").getByRole("gridcell").first()).toHaveText("E" + epicus.title);
  await expect(rows(page, "Doom").locator('[data-cell$=":0"]')).toHaveText([
    "EEpicus Doomicus Metallicus",
    "NNightfall",
    "LLive in Stockholm",
    "TTales of Creation",
    "DDactylis Glomerata",
  ]);
  // The services column is empty: these albums have no links (DS-21, TON-47).
  await expect(rows(page, "Doom").nth(2).getByRole("gridcell")).toHaveText([
    "LLive in Stockholm",
    "Candlemass",
    "rec. 1988",
    "Live",
    "",
    "",
  ]);
  expect(await violations(page, '[role="grid"]')).toEqual([]);

  // Unsorted holds only the album in no list.
  await page.goto("/unsorted");
  await expect(rows(page, "Unsorted").locator('[data-cell$=":0"]')).toHaveText(["AAncient Dreams"]);

  // Narrower, the services and the type collapse (DS-21).
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto(`/l/${doom.id}`);
  await expect(rows(page, "Doom").nth(2).getByRole("gridcell")).toHaveText([
    "LLive in Stockholm",
    "Candlemass",
    "rec. 1988",
    "",
  ]);

  // Grid for this list: three cards a row at this width, walked with the arrows.
  await chooseLayout(page, "Grid");
  const cards = grid(page, "Doom");
  await expect(cards).toHaveAttribute("aria-colcount", "3");
  await expect(cards).toHaveAttribute("aria-rowcount", "2");
  await cards.getByRole("gridcell", { name: /^Epicus/ }).click();
  await page.keyboard.press("ArrowRight");
  await expect(cards.getByRole("gridcell", { name: /^Nightfall/ })).toBeFocused();
  await expect(cards.getByRole("gridcell", { name: /^Nightfall/ })).toHaveCSS(
    "outline-style",
    "solid",
  );
  await page.keyboard.press("ArrowDown");
  await expect(cards.getByRole("gridcell", { name: /^Dactylis Glomerata/ })).toBeFocused();
  expect(await violations(page, '[role="grid"]')).toEqual([]);

  // The choice is kept for this list only.
  await page.reload();
  await live(page);
  await expect(grid(page, "Doom")).toHaveAttribute("aria-colcount", "3");
  // Unsorted is still in rows: its one album and the header row.
  await page.goto("/unsorted");
  await expect(grid(page, "Unsorted")).toHaveAttribute("aria-rowcount", "2");

  // A rename from another session updates the row in place.
  await page.goto(`/l/${doom.id}`);
  await chooseLayout(page, "Rows");
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: {
      mutationId: uuidv7(),
      name: "album.update",
      args: { id: epicus.id, title: "Epicus Doomicus Metallicus (remastered)" },
      base: { title: epicus.title },
    },
  });
  expect(response.status()).toBe(200);
  await expect(rows(page, "Doom").first().getByRole("gridcell").first()).toHaveText(
    "EEpicus Doomicus Metallicus (remastered)",
  );
});

test("cards keep their size when the inspector opens beside them, showing fewer a row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await signIn(page, accounts.viewsInspector);
  await live(page);
  const doom = await created(page, "Doom");
  const albums = Array.from({ length: 8 }, (_, index) =>
    album(`Doom ${index + 1}`, { originalYear: 1980 + index }),
  );
  await added(page, albums, doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await chooseLayout(page, "Grid");

  const cards = grid(page, "Doom");
  const first = cards.getByRole("gridcell", { name: /^Doom 1/ });
  const width = async () => (await first.boundingBox())?.width;
  const columns = await cards.getAttribute("aria-colcount");
  const size = await width();
  expect(size).toBeGreaterThan(160);

  await first.click();
  await expect(page.getByRole("complementary", { name: "Album" })).toBeVisible();
  await expect(cards).not.toHaveAttribute("aria-colcount", columns ?? "");
  expect(await width()).toBe(size);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Album" })).toHaveCount(0);
  await expect(cards).toHaveAttribute("aria-colcount", columns ?? "");
  expect(await width()).toBe(size);
});

/** The background of a card's raised surface, its `::before` (TON-167). */
const surface = (card: Locator) =>
  card.evaluate((element) => getComputedStyle(element, "::before").backgroundColor);
const transparent = "rgba(0, 0, 0, 0)";

test("cards mark the open album, raise a surface under the pointer, and label releases that aren't studio albums", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, accounts.viewsCards);
  await live(page);
  const doom = await created(page, "Doom");
  await added(
    page,
    [
      album("Nightfall", { originalYear: 1987 }),
      album("Tales of Creation", { originalYear: 1989, releaseType: "ep" }),
      album("Live in Stockholm", { isLive: true, originalYear: 1990, recordingYearStart: 1988 }),
      album("The Best of Candlemass", {
        originalYear: 1991,
        releaseType: "compilation",
        isLive: true,
        recordingYearStart: 1990,
      }),
    ],
    doom.id,
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);

  // Rows: each small cover has the light edge, and no shadow (DS-16, DS-23).
  const rowCover = grid(page, "Doom").locator('[data-slot="artwork"]').first();
  await expect(rowCover).toHaveCSS("box-shadow", "none");
  await expect(rowCover.locator('[data-slot="artwork-edge"]')).toHaveCSS("box-shadow", /inset/);

  await chooseLayout(page, "Grid");
  const cards = grid(page, "Doom");
  const card = (title: string) => cards.getByRole("gridcell", { name: new RegExp(`^${title}`) });

  // Cards' covers cast a soft shadow, over the edge.
  const cover = card("Nightfall").locator('[data-slot="artwork"]');
  await expect(cover).not.toHaveCSS("box-shadow", "none");
  await expect(cover.locator('[data-slot="artwork-edge"]')).toHaveCSS("box-shadow", /inset/);

  // Labels name what isn't a studio album; the words follow the year for assistive technology.
  const label = (title: string) => card(title).locator('[data-slot="release-label"]');
  await expect(label("Nightfall")).toHaveCount(0);
  await expect(label("Tales of Creation")).toHaveText("EP");
  await expect(label("Live in Stockholm")).toHaveText("Live");
  await expect(label("The Best of Candlemass")).toHaveText("Compilation · Live");
  await expect(label("Tales of Creation")).toHaveCSS("text-transform", "uppercase");
  await expect(card("Tales of Creation")).toHaveAccessibleName(/^Tales of Creation.*, EP$/);
  expect(await violations(page, '[role="grid"]')).toEqual([]);

  // A hovering pointer raises a surface behind the card, gone when it leaves.
  expect(await surface(card("Nightfall"))).toBe(transparent);
  await card("Nightfall").hover();
  await expect.poll(() => surface(card("Nightfall"))).not.toBe(transparent);
  await page.mouse.move(1, 1);
  await expect.poll(() => surface(card("Nightfall"))).toBe(transparent);

  // The open album's card: a ring around its cover, its title on the accent.
  const inspector = page.getByRole("complementary", { name: "Album" });
  await card("Nightfall").click();
  await expect(inspector).toBeVisible();
  await expect(card("Nightfall")).toHaveAttribute("data-open", "true");
  await expect(cover).toHaveCSS("outline-style", "solid");
  await expect(cover).toHaveCSS("outline-offset", "3px");
  await expect(card("Nightfall").getByText("Nightfall", { exact: true })).not.toHaveCSS(
    "background-color",
    transparent,
  );
  await expect(cards.locator("[data-open]")).toHaveCount(1);

  // Another album takes the mark; closing the inspector clears it.
  await card("Tales of Creation").click();
  await expect(card("Tales of Creation")).toHaveAttribute("data-open", "true");
  await expect(card("Nightfall")).not.toHaveAttribute("data-open");
  await expect(cover).toHaveCSS("outline-style", "none");
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  await expect(cards.locator("[data-open]")).toHaveCount(0);
});

test("a folder opens as cards fanning each list's first covers, walked by keyboard; Rows is kept per folder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, accounts.viewsFolderCards);
  await live(page);
  const rock: Container = { ...list("Rock"), kind: "folder" };
  const classic: Container = { ...list("Classic Rock"), kind: "folder", parentId: rock.id };
  const zeppelin: Container = { ...list("Led Zeppelin"), parentId: classic.id };
  const who: Container = { ...list("The Who"), parentId: classic.id };
  const prog: Container = { ...list("Prog"), kind: "folder", parentId: classic.id };
  const yes: Container = { ...list("Yes"), parentId: prog.id };
  await insert(page, rock, classic, zeppelin, who, prog, yes);
  // Added out of order: a list's covers follow its own sort, by year.
  await added(
    page,
    [
      album("Presence", { originalYear: 1976 }),
      album("Celebration Day", { originalYear: 2012 }),
      album("Led Zeppelin II", { originalYear: 1969 }),
      album("Houses of the Holy", { originalYear: 1973 }),
    ],
    zeppelin.id,
  );
  await added(
    page,
    [album("Fragile", { originalYear: 1971 }), album("Close to the Edge", { originalYear: 1972 })],
    yes.id,
  );
  await page.goto(`/f/${classic.id}`);
  await live(page);

  const cards = grid(page, "Classic Rock");
  const card = (name: string) => cards.getByRole("link", { name: new RegExp(`^${name}`) });
  // The letters of the fanned covers, back to front: the list's first three by year, the first in front.
  const fan = (name: string) => card(name).locator('[data-slot="cover-fan-cover"]');
  await expect(fan("Led Zeppelin")).toHaveText(["P", "H", "L"]);
  await expect(card("Led Zeppelin")).toContainText("4 albums");
  // An empty list shows its icon; a subfolder fans the covers found inside it.
  await expect(card("The Who").locator('[data-slot="cover-fan-empty"]')).toHaveCount(1);
  await expect(card("The Who")).toContainText("0 albums");
  await expect(fan("Prog")).toHaveText(["C", "F"]);
  await expect(card("Prog")).toContainText("1 folder or list");
  expect(await violations(page, '[role="grid"]')).toEqual([]);

  // The arrows walk the cards and Enter opens one.
  await card("Led Zeppelin").focus();
  await page.keyboard.press("ArrowRight");
  await expect(card("The Who")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/l/${who.id}`);

  // Rows, chosen for this folder, are kept for it alone: Rock still shows cards.
  await page.goto(`/f/${classic.id}`);
  await live(page);
  await chooseLayout(page, "Rows");
  await expect(rows(page, "Classic Rock")).toHaveCount(3);
  await page.reload();
  await live(page);
  await expect(rows(page, "Classic Rock")).toHaveCount(3);
  await page.goto(`/f/${rock.id}`);
  await live(page);
  await expect(grid(page, "Rock").getByRole("link", { name: /^Classic Rock/ })).toContainText(
    "3 folders and lists",
  );
  await expect(grid(page, "Rock").locator('[data-slot="cover-fan-cover"]')).toHaveCount(3);
});

test("a folder shows its folders and lists as rows, opened by keyboard", async ({ page }) => {
  await signIn(page, accounts.viewsFolder);
  await live(page);
  // Folders as rows, which this test is about; cards are their default (TON-174).
  await foldersAsRows(page);
  const metal: Container = { ...list("Metal"), kind: "folder" };
  const funeral: Container = { ...list("Funeral"), kind: "folder", parentId: metal.id };
  const doom: Container = { ...list("Doom"), parentId: metal.id };
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).isPersisted.promise;
    },
    [metal, funeral, doom],
  );
  await added(page, [album("Nightfall"), album("Epicus")], doom.id);

  await page.goto("/c");
  await expect(rows(page, "Collection").getByRole("gridcell")).toHaveText([
    "Metal",
    "2 folders and lists",
  ]);
  await page.goto(`/f/${metal.id}`);
  const inside = rows(page, "Metal");
  await expect(inside.nth(0).getByRole("gridcell")).toHaveText(["Funeral", "0 folders and lists"]);
  await expect(inside.nth(1).getByRole("gridcell")).toHaveText(["Doom", "2 albums"]);
  expect(await violations(page, '[role="grid"]')).toEqual([]);

  await inside.nth(0).getByRole("link", { name: "Funeral" }).focus();
  await page.keyboard.press("j");
  await expect(inside.nth(1).getByRole("link", { name: "Doom" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(inside.nth(1).getByRole("gridcell", { name: "2 albums" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/l/${doom.id}`);
});

/** Frame intervals while the view scrolls for about three seconds, in ms; with `idle`, while nothing happens. */
async function scrollFrames(page: Page, { idle = false } = {}): Promise<number[]> {
  await page.evaluate(() => {
    const frames: number[] = [];
    let last = performance.now();
    const tick = (now: number) => {
      frames.push(now - last);
      last = now;
      Object.assign(window, { frames, frame: requestAnimationFrame(tick) });
    };
    Object.assign(window, { frames, frame: requestAnimationFrame(tick) });
  });
  for (let step = 0; step < 180; step += 1) {
    // oxlint-disable-next-line no-await-in-loop
    if (!idle) await page.mouse.wheel(0, step < 90 ? 240 : -240);
    // oxlint-disable-next-line no-await-in-loop
    await page.waitForTimeout(16);
  }
  return page.evaluate(() => {
    const frame: unknown = Reflect.get(window, "frame");
    const frames: unknown = Reflect.get(window, "frames");
    if (typeof frame === "number") cancelAnimationFrame(frame);
    return Array.isArray(frames) ? frames.slice(1).filter((each) => typeof each === "number") : [];
  });
}

function report(layout: string, frames: number[]): void {
  const sorted = frames.toSorted((a, b) => a - b);
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  console.log(
    `${layout}: ${frames.length} frames, median ${at(0.5).toFixed(1)} ms, p95 ${at(0.95).toFixed(1)} ms, max ${(sorted.at(-1) ?? 0).toFixed(1)} ms, over 50 ms: ${frames.filter((each) => each > 50).length}`,
  );
}

/**
 * Clicks `view`'s first drawn cell until a cell of it holds focus. A layout switch can draw the view again just
 * after the click, taking the focused cell with it, and a key pressed then reaches nothing (TON-102).
 */
async function focusIn(view: Locator): Promise<void> {
  await expect(async () => {
    await view.getByRole("gridcell").first().click();
    await expect(view.locator(":focus")).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("5,000 albums stay virtualized in both layouts", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, accounts.viewsLarge);
  await live(page);
  const many = Array.from({ length: 5_000 }, (_, index) =>
    album(`Album ${String(index + 1).padStart(4, "0")}`),
  );
  await added(page, many);

  await page.goto("/unsorted");
  await live(page);
  const unsorted = grid(page, "Unsorted");
  await expect(unsorted).toHaveAttribute("aria-rowcount", "5001");
  expect(await rows(page, "Unsorted").count()).toBeLessThan(60);
  await focusIn(unsorted);
  await page.keyboard.press("ControlOrMeta+End");
  // The jump scrolls past 5,000 rows, which a busy machine can take beyond the default 5 s to draw; this test is
  // about virtualization, and TS-120's measurements time the views (TON-102).
  await expect(page.locator(":focus")).toHaveText("", { timeout: 15_000 });
  await expect(rows(page, "Unsorted").filter({ hasText: "Album 5000" })).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.locator(":focus")).toHaveText("AAlbum 5000");
  if (process.env.MEASURE_SCROLL) {
    await page.mouse.move(800, 450);
    // The browser's own pace, with nothing moving, to read the scroll against.
    report("Idle", await scrollFrames(page, { idle: true }));
    report("Rows", await scrollFrames(page));
  }

  await chooseLayout(page, "Grid");
  const cards = grid(page, "Unsorted");
  const columns = Number(await cards.getAttribute("aria-colcount"));
  await expect(cards).toHaveAttribute("aria-rowcount", String(Math.ceil(5_000 / columns)));
  expect(await cards.getByRole("gridcell").count()).toBeLessThan(120);
  await focusIn(cards);
  // The click opened its album beside the grid. That leaves the grid where it is: the router once put it at the rows'
  // last offset, its scroll container being in the same place, and so stopped a ⌘End under way (TON-118).
  await expect(page.getByRole("complementary", { name: "Album" })).toContainText("Album 0001");
  expect(await cards.evaluate((element) => element.parentElement?.scrollTop)).toBe(0);
  await page.keyboard.press("ControlOrMeta+End");
  await expect(page.locator(":focus")).toHaveAccessibleName(/^Album 5000/, { timeout: 15_000 });
  if (process.env.MEASURE_SCROLL) {
    await page.mouse.move(800, 450);
    report("Grid", await scrollFrames(page));
  }
});
