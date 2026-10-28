// The collection views in a real browser (FR-05, DS-21–DS-23, DS-40, DS-41, DS-106, DS-115): albums as rows or
// cards (switched in View options, DS-49), folders and lists as rows, walked as ARIA grids by keyboard, and 5,000
// albums kept smooth by virtualization. With MEASURE_SCROLL=1, the 5,000-album test also measures scrolling, frame by frame, and prints it;
// run it headed (`--headed`), since headless Chromium paces frames irregularly even when idle. Each test signs in
// with its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, list, live, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const grid = (page: Page, name: string) => page.getByRole("grid", { name });
/** The grid's data rows: every row but the hidden header. */
const rows = (page: Page, name: string) =>
  grid(page, name)
    .getByRole("row")
    .filter({ hasNot: page.getByRole("columnheader") });

/** Switches the view to `layout` in its View options (DS-49). */
async function chooseLayout(page: Page, layout: "Rows" | "Grid"): Promise<void> {
  await page.getByRole("button", { name: "View", exact: true }).click();
  const options = page.getByRole("dialog", { name: "View options" });
  const radio = options
    .getByRole("radiogroup", { name: "Layout" })
    .getByRole("radio", { name: layout });
  await radio.click();
  await expect(radio).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
}

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

test("a folder shows its folders and lists as rows, opened by keyboard", async ({ page }) => {
  await signIn(page, accounts.viewsFolder);
  await live(page);
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
  await rows(page, "Unsorted").first().getByRole("gridcell").first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await expect(page.locator(":focus")).toHaveText("");
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
  await cards.getByRole("gridcell").first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await expect(page.locator(":focus")).toHaveAccessibleName(/^Album 5000/);
  if (process.env.MEASURE_SCROLL) {
    await page.mouse.move(800, 450);
    report("Grid", await scrollFrames(page));
  }
});
