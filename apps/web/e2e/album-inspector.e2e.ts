// The album inspector and manual entry in a real browser (FR-02.4, FR-02.6, FR-03.1, FR-01.6, FR-01.8; DS-46, DS-47,
// DS-32): opening an album by click with `?album=`, J moving it and Esc closing it; editing its chronology in
// Editing mode, shown in every list, and a refused choice; taking it out of its only list with Undo, and adding it
// to one with L, suggested as recent or found by typing (TON-177); the manual entry form's required information,
// saving into the current list, and asking before discarding; and an album's own page. Each test signs in with its
// own account.

import { expect, test, type Locator, type Page } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  added,
  album,
  announcements,
  chooseLayout,
  created,
  list,
  live,
  saved,
  toasts,
  violations,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const inspector = (page: Page) => page.getByRole("complementary", { name: "Album" });
const grid = (page: Page, name: string) => page.getByRole("grid", { name });
const rowOf = (page: Page, gridName: string, text: string) =>
  grid(page, gridName).getByRole("row").filter({ hasText: text });
const mode = (page: Page, name: "View" | "Edit") =>
  page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name });
const lists = (page: Page) => inspector(page).getByRole("region", { name: "Lists" });
const overflows = (scroller: Locator) =>
  scroller.evaluate((element) => element.scrollHeight > element.clientHeight);

test("the inspector's left edge resizes it, kept on the device, and the artwork grows with it up to 500 px", async ({
  page,
}) => {
  await signIn(page, accounts.inspectorResize);
  await live(page);
  const doom = await created(page, "Doom");
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(page, [nightfall], doom.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/l/${doom.id}?album=${nightfall.id}`);
  await live(page);
  const cover = inspector(page).getByRole("img", { name: "Cover of Nightfall" });
  const width = async (locator: ReturnType<typeof inspector>) =>
    (await locator.boundingBox())?.width;

  // 380 px at first, the artwork filling it but for the padding.
  expect(await width(inspector(page))).toBe(380);
  expect(await width(cover)).toBe(380 - 1 - 32);

  // ← widens it, as its edge moves left; End takes it to 560 px, where the artwork stops at 500.
  const edge = page.getByRole("separator", { name: "Resize album panel" });
  await edge.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(edge).toHaveAttribute("aria-valuenow", "396");
  await page.keyboard.press("End");
  await expect(edge).toHaveAttribute("aria-valuenow", "560");
  await expect.poll(() => width(inspector(page))).toBe(560);
  expect(await width(cover)).toBe(500);

  // Dragged back by pointer, and kept after a reload.
  const box = await edge.boundingBox();
  if (!box) throw new Error("The edge has no box.");
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + 200, { steps: 4 });
  await page.mouse.up();
  await expect(edge).toHaveAttribute("aria-valuenow", "460");
  await page.reload();
  await live(page);
  await expect(page.getByRole("separator", { name: "Resize album panel" })).toHaveAttribute(
    "aria-valuenow",
    "460",
  );
  expect(await violations(page, "aside")).toEqual([]);
});

test("with the panel and the sidebar longer than the window, only they scroll, never the page", async ({
  page,
}) => {
  await signIn(page, accounts.inspectorPage);
  await live(page);
  const doom = await created(page, "Doom");
  await Promise.all(
    ["Ash", "Birch", "Cedar", "Elm", "Fir", "Hazel", "Larch", "Oak", "Pine"].map((name) =>
      created(page, name),
    ),
  );
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(page, [nightfall], doom.id);
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto(`/l/${doom.id}?album=${nightfall.id}`);
  await live(page);
  // Editing mode lengthens the panel with fields, switches and choices.
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();
  await expect(inspector(page).getByRole("switch", { name: "Live" })).toBeAttached();

  expect(await overflows(inspector(page).locator('[data-page-scroll="album"]'))).toBe(true);
  expect(await overflows(page.locator('[data-slot="scroll-area-viewport"]'))).toBe(true);

  // Labels and inputs only screen readers see, below the fold, used to stretch the page past the shell; the window
  // then scrolled the panes away over a blank band (TON-158).
  const windowState = () =>
    page.evaluate(() => {
      window.scrollTo(0, 1000);
      return { height: document.documentElement.scrollHeight, scrolled: window.scrollY };
    });
  expect(await windowState()).toEqual({ height: 480, scrolled: 0 });
});

test("in Editing mode, a double-click on a card opens the album, and on a row's title edits it instead", async ({
  page,
}) => {
  await signIn(page, accounts.inspectorDoubleClick);
  await live(page);
  const doom = await created(page, "Doom");
  await added(page, [album("Nightfall", { originalYear: 1987 }), album("Epicus")], doom.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();

  // A row's title waits out the double-click, which edits it (DS-45): the inspector stays closed.
  await rowOf(page, "Doom", "Nightfall").getByRole("gridcell").first().dblclick();
  await expect(page.getByRole("textbox", { name: "Title of 'Nightfall'" })).toBeFocused();
  await expect(inspector(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("album")).toBe(false);
  await page.keyboard.press("Escape");

  // A card has nothing to double-click, so its first click opens the album at once (TON-159).
  await chooseLayout(page, "Grid");
  await grid(page, "Doom")
    .getByRole("gridcell", { name: /^Epicus/ })
    .dblclick();
  await expect(inspector(page).getByRole("textbox", { name: "Title of 'Epicus'" })).toBeVisible();
});

test("the panel slides in and out, fades under reduced motion, and shows at once after a reload or Back", async ({
  page,
}) => {
  // The panel's animations, as the page asks for them.
  await page.addInitScript(() => {
    const slides: { keyframes: unknown; duration: unknown; easing: unknown }[] = [];
    Object.assign(window, { slides });
    // Kept to be called on its element below.
    // oxlint-disable-next-line typescript/unbound-method
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.matches('aside[aria-label="Album"]') && typeof options === "object")
        slides.push({ keyframes, duration: options.duration, easing: options.easing });
      return animate.call(this, keyframes, options);
    };
  });
  const slides = () =>
    page.evaluate(() => {
      const seen: unknown = Reflect.get(window, "slides");
      return Array.isArray(seen) ? seen : [];
    });
  const enter = "cubic-bezier(0.2, 0, 0, 1)";
  const exit = "cubic-bezier(0.4, 0, 1, 1)";
  const away = { transform: "translateX(100%)" };
  const rest = { transform: "none" };
  await signIn(page, accounts.inspectorSlide);
  await live(page);
  const doom = await created(page, "Doom");
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(page, [nightfall], doom.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/l/${doom.id}`);
  await live(page);

  // In from the right, and out again over the view, which has its width back at once.
  await rowOf(page, "Doom", "Nightfall").getByRole("gridcell").first().click();
  await expect(inspector(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector(page)).toHaveCount(0);
  expect(await slides()).toEqual([
    { keyframes: [away, rest], duration: 200, easing: enter },
    { keyframes: [rest, away], duration: 200, easing: exit },
  ]);

  // Back reopens it at once, as page switches do on Back.
  await page.goBack();
  await expect(inspector(page)).toBeVisible();
  expect(await slides()).toHaveLength(2);

  // A reload with it open shows it as it is.
  await page.reload();
  await live(page);
  await expect(inspector(page)).toBeVisible();
  expect(await slides()).toEqual([]);

  // With reduced motion, it fades.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Escape");
  await expect(inspector(page)).toHaveCount(0);
  await rowOf(page, "Doom", "Nightfall").getByRole("gridcell").first().click();
  await expect(inspector(page)).toBeVisible();
  expect(await slides()).toEqual([
    { keyframes: [{ opacity: 1 }, { opacity: 0 }], duration: 200, easing: exit },
    { keyframes: [{ opacity: 0 }, { opacity: 1 }], duration: 200, easing: enter },
  ]);
});

test("a click opens an album in the inspector, J moves it, and Esc closes it", async ({ page }) => {
  await signIn(page, accounts.inspectorOpen);
  await live(page);
  const doom = await created(page, "Doom");
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(page, [nightfall, album("Ancient Dreams", { originalYear: 1988 })], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);

  await rowOf(page, "Doom", "Nightfall").getByRole("gridcell").first().click();
  await expect(inspector(page).getByRole("heading", { name: "Nightfall" })).toBeVisible();
  await expect(inspector(page)).toContainText("Candlemass");
  await expect(inspector(page)).toContainText("1987");
  await expect(inspector(page)).toContainText("Sorts by its original release year.");
  await expect(lists(page).getByRole("link", { name: "Doom" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`\\?album=${nightfall.id}$`));
  expect(await violations(page, "aside")).toEqual([]);

  // Viewing mode shows values, not fields.
  await expect(inspector(page).getByRole("textbox")).toHaveCount(0);

  await page.keyboard.press("j");
  await expect(inspector(page).getByRole("heading", { name: "Ancient Dreams" })).toBeVisible();
  await page.keyboard.press("k");
  await expect(inspector(page).getByRole("heading", { name: "Nightfall" })).toBeVisible();

  // The address keeps it across a reload.
  await page.reload();
  await live(page);
  await expect(inspector(page).getByRole("heading", { name: "Nightfall" })).toBeVisible();

  await rowOf(page, "Doom", "Nightfall").getByRole("gridcell").first().focus();
  await page.keyboard.press("Escape");
  await expect(inspector(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/l/${doom.id}$`));

  // Enter opens it in Viewing mode.
  await page.keyboard.press("Enter");
  await expect(inspector(page).getByRole("heading", { name: "Nightfall" })).toBeVisible();
});

test("the panel takes its cover's color at the top, gathers its facts under Properties, and divides its sections", async ({
  page,
}) => {
  await signIn(page, accounts.inspectorProperties);
  await live(page);
  const doom = await created(page, "Doom");
  // The fixture host's cover is one green pixel.
  const nightfall = album("Nightfall", {
    originalYear: 1987,
    artworkUrl: "https://images.example/nightfall.png",
  });
  await added(page, [nightfall, album("Ancient Dreams", { originalYear: 1988 })], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);

  await rowOf(page, "Doom", "Nightfall").getByRole("gridcell").first().click();
  const panel = inspector(page);
  await expect(panel.getByRole("heading", { name: "Nightfall" })).toBeVisible();
  // The wash: the cover's green, at the wash's lightness and chroma (TON-173).
  await expect(panel.locator('[data-slot="cover-wash"]')).toHaveCSS(
    "background-image",
    /oklch\(0\.21 0\.08 1[34]\d(\.\d+)?\)/,
  );

  // Viewing mode: the chronology folds into Properties, at the end.
  const properties = panel.getByRole("region", { name: "Properties" });
  await expect(panel.getByRole("region", { name: "Chronology" })).toHaveCount(0);
  await expect(properties.locator("dt")).toHaveText([
    "Release type",
    "Live",
    "Original release year",
    "Added",
    "In lists",
    "Links",
  ]);
  await expect(properties.locator("dd")).toHaveText([
    "Album",
    "No",
    "1987",
    /^\w{3} \d{1,2}, \d{4}$/,
    "1",
    "None",
  ]);
  await expect(properties).toContainText("Sorts by its original release year.");
  // A thin line divides each section from the one above.
  await Promise.all(
    ["Links", "Custom fields", "Lists", "Properties"].map((name) =>
      expect(panel.getByRole("region", { name })).toHaveCSS("border-top-style", "solid"),
    ),
  );
  expect(await violations(page, "aside")).toEqual([]);

  // Editing mode: Chronology's fields come back, and Properties keeps the rest.
  await mode(page, "Edit").click();
  await expect(panel.getByRole("region", { name: "Chronology" })).toBeVisible();
  await expect(properties.locator("dt")).toHaveText(["Added", "In lists", "Links"]);

  // An album without artwork has no wash.
  await rowOf(page, "Doom", "Ancient Dreams").getByRole("gridcell").nth(1).click();
  await expect(panel.getByRole("textbox", { name: /^Title/ })).toHaveValue("Ancient Dreams");
  await expect(panel.locator('[data-slot="cover-wash"]')).toHaveCount(0);
});

test("Editing mode edits the chronology everywhere, and refuses leaving an album without a year", async ({
  page,
}) => {
  await signIn(page, accounts.inspectorEdit);
  await live(page);
  const doom = await created(page, "Doom");
  const concerts = await created(page, "Concerts");
  const rainbow = album("Live at the Rainbow", { originalYear: 1984 });
  const evil = album("Live Evil", {
    isLive: true,
    originalYear: null,
    recordingYearStart: 1982,
    recordingYearEnd: 1982,
    artworkUrl: null,
  });
  await added(page, [rainbow, evil], doom.id);
  await page.evaluate(
    async ({ listId, albumId }) => {
      await window.tonarisSync?.memberships
        .insert({
          listId,
          albumId,
          addedAt: new Date().toISOString(),
        })
        .when("settled");
    },
    { listId: concerts.id, albumId: rainbow.id },
  );
  await page.goto(`/l/${doom.id}?album=${rainbow.id}`);
  await live(page);
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();

  await inspector(page).getByRole("switch", { name: "Live" }).click();
  const recording = inspector(page).getByRole("textbox", { name: "Recording year or range" });
  await recording.fill("1978–1982");
  await recording.press("Enter");
  await expect(inspector(page)).toContainText("Sorts by its recording year.");
  await expect(rowOf(page, "Doom", "Live at the Rainbow")).toContainText("rec. 1978–1982");
  await saved(page);
  await page.goto(`/l/${concerts.id}`);
  await live(page);
  await expect(rowOf(page, "Concerts", "Live at the Rainbow")).toContainText("rec. 1978–1982");

  // Live Evil has only its recording year, so Live can't go off.
  await page.goto(`/l/${doom.id}?album=${evil.id}`);
  await live(page);
  const liveSwitch = inspector(page).getByRole("switch", { name: "Live" });
  await liveSwitch.click();
  await expect(inspector(page)).toContainText("Give the album a year.");
  await expect(liveSwitch).toBeChecked();

  // A malformed year stays in its field with the reason, and nothing is sent.
  const original = inspector(page).getByRole("textbox", { name: "Original release year" });
  await original.fill("nineteen");
  await original.press("Enter");
  await expect(inspector(page)).toContainText("Enter the year as four digits, such as 1986.");
  await expect(original).toHaveValue("nineteen");
  await expect(original).toHaveAttribute("aria-invalid", "true");
  expect(await violations(page, "aside")).toEqual([]);
});

test("the inspector takes an album out of its only list with Undo, and L adds it to another", async ({
  page,
}) => {
  await signIn(page, accounts.inspectorLists);
  await live(page);
  const doom = await created(page, "Doom");
  await created(page, "Epic");
  const nightfall = album("Nightfall");
  await added(page, [nightfall], doom.id);
  await page.goto(`/l/${doom.id}?album=${nightfall.id}`);
  await live(page);
  await page.keyboard.press("e");

  await lists(page).getByRole("button", { name: "Remove from Doom" }).click();
  await expect(lists(page).getByRole("link", { name: "Unsorted" })).toBeVisible();
  const undo = toasts(page).filter({ hasText: "Removed from Doom" });
  await expect(undo).toBeVisible();
  await expect(announcements(page).first()).toHaveText("Removed Nightfall from Doom");
  await saved(page);
  await page.goto(`/unsorted?album=${nightfall.id}`);
  await live(page);
  await expect(rowOf(page, "Unsorted", "Nightfall")).toBeVisible();

  // Undo puts it back.
  await page.goto(`/l/${doom.id}?album=${nightfall.id}`);
  await live(page);
  await lists(page).getByRole("link", { name: "Unsorted" }).waitFor();
  await page.evaluate(
    async ({ listId, albumId }) => {
      await window.tonarisSync?.memberships
        .insert({
          listId,
          albumId,
          addedAt: new Date().toISOString(),
        })
        .when("settled");
    },
    { listId: doom.id, albumId: nightfall.id },
  );
  await expect(lists(page).getByRole("link", { name: "Doom" })).toBeVisible();
  await lists(page).getByRole("button", { name: "Remove from Doom" }).click();
  await toasts(page)
    .filter({ hasText: "Removed from Doom" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(lists(page).getByRole("link", { name: "Doom" })).toBeVisible();
  await saved(page);

  // L adds it to Epic, from its row.
  await rowOf(page, "Doom", "Nightfall").getByRole("gridcell").first().click();
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "Add 'Nightfall' to a list" });
  await expect(picker).toBeVisible();
  // The Undo toast is a dialog too, and may still be fading out: check the picker alone.
  expect(await violations(page, '[data-slot="dialog-content"]')).toEqual([]);
  await picker.getByRole("option", { name: "Epic" }).click();
  await expect(picker).toHaveCount(0);
  await expect(lists(page).getByRole("link", { name: "Epic" })).toBeVisible();
  await expect(lists(page).getByRole("link", { name: "Doom" })).toBeVisible();
  await saved(page);
});

test("Add to a list suggests recent lists, and finds the others by typing their names or folders", async ({
  page,
}) => {
  await signIn(page, accounts.findList);
  await live(page);
  const rock = { ...list("Русский рок"), kind: "folder" as const };
  const decade = { ...list("4 2000-2010-е"), kind: "folder" as const, parentId: rock.id };
  const doom = list("Doom");
  const mixes = Array.from({ length: 9 }, (_, n) => list(`Mix ${n + 1}`));
  // Each level after the one above it.
  await page.evaluate(
    async (levels) => {
      for (const level of levels) {
        // oxlint-disable-next-line no-await-in-loop
        await window.tonarisSync?.containers.insert(level).when("settled");
      }
    },
    [
      [rock, doom, ...mixes],
      [decade],
      [
        { ...list("Земфира"), parentId: decade.id },
        { ...list("Noize MC"), parentId: decade.id },
      ],
    ],
  );
  const nightfall = album("Nightfall");
  await added(page, [nightfall], doom.id);
  const fifth = mixes[4];
  if (!fifth) throw new Error("No fifth mix.");
  await added(page, [album("Epicus")], fifth.id);
  await page.goto(`/l/${doom.id}?album=${nightfall.id}`);
  await live(page);
  await page.keyboard.press("e");

  await lists(page).getByRole("button", { name: "Add to list" }).click();
  const picker = page.getByRole("dialog", { name: "Add 'Nightfall' to a list" });
  const field = picker.getByRole("combobox", { name: "Find a list" });
  const options = picker.getByRole("option");
  await expect(field).toBeFocused();

  // Before typing: the list added to last, then others by path, 8 in all; Doom, its own, isn't offered.
  await expect(picker.getByRole("group", { name: "Recent" }).getByRole("option")).toHaveText([
    "Mix 5",
  ]);
  await expect(options).toHaveCount(8);
  await expect(options.filter({ hasText: "Doom" })).toHaveCount(0);
  await expect(picker.getByText("Type to find the other 3 lists.")).toBeVisible();
  expect(await violations(page, '[data-slot="dialog-content"]')).toEqual([]);

  // A folder's name and part of the list's find it, marked; the arrows and Enter add it.
  await field.fill("2000 ЗЕМФ");
  await expect(options).toHaveText(["Русский рок › 4 2000-2010-е › Земфира"]);
  await expect(options.first().locator("mark")).toHaveText(["2000", "Земф"]);
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await field.fill("рок");
  await expect(options).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(lists(page).getByRole("link", { name: "Земфира" })).toBeVisible();
  await expect(announcements(page).first()).toHaveText("Added Nightfall to Земфира");
  await saved(page);

  // It opens afresh, and says when nothing matches.
  await lists(page).getByRole("button", { name: "Add to list" }).click();
  await expect(field).toHaveValue("");
  await field.fill("jazz");
  await expect(options).toHaveCount(0);
  await expect(picker.getByText("No lists match 'jazz'.")).toBeVisible();
});

test("the form reports missing required information, saves nothing, and asks before discarding", async ({
  page,
}) => {
  await signIn(page, accounts.entryRequired);
  await live(page);
  await page.goto("/c");
  await live(page);

  await page.getByRole("button", { name: "Add album" }).click();

  // "Add album" opens capture; manual entry is a step further (DS-48).

  await page

    .getByRole("dialog", { name: "Add albums" })

    .getByRole("button", { name: "Enter manually" })

    .click();
  const form = page.getByRole("dialog", { name: "New album" });
  await expect(form.getByRole("textbox", { name: "Title" })).toBeFocused();
  await Promise.all(
    ["Artwork URL", "Spotify link", "Tidal link", "Custom fields", "List"].map((field) =>
      expect(form.getByText(field, { exact: true })).toBeVisible(),
    ),
  );
  expect(await violations(page, '[role="dialog"]')).toEqual([]);

  await form.getByRole("textbox", { name: "Title" }).fill("Nightfall");
  await form.getByRole("button", { name: "Add album" }).click();
  await expect(form.getByRole("alert")).toContainText(
    "Check 2 fields: Artist, Original release year.",
  );
  await expect(form.getByText("Give the album an artist.")).toBeVisible();
  await expect(form.getByText("Give the album its original release year.")).toBeVisible();
  await expect(form.getByRole("textbox", { name: "Artist" })).toBeFocused();
  await expect(form.getByRole("textbox", { name: "Artist" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(await page.evaluate(() => window.tonarisSync?.albums.size)).toBe(0);

  // Esc asks first; Keep editing keeps what was typed.
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog", { name: "Discard this album?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(form.getByRole("textbox", { name: "Title" })).toHaveValue("Nightfall");
  await page.keyboard.press("Escape");
  await discard.getByRole("button", { name: "Discard" }).click();
  await expect(form).toHaveCount(0);
  expect(await page.evaluate(() => window.tonarisSync?.albums.size)).toBe(0);
  // Adding is an edit, so the form opened in Editing mode.
  await expect(mode(page, "Edit")).toBeChecked();
});

test("the form saves into the list on view, and live albums need only their recording year", async ({
  page,
}) => {
  await signIn(page, accounts.entryIntoList);
  await live(page);
  const doom = await created(page, "Doom");
  await page.goto(`/l/${doom.id}`);
  await live(page);

  // The empty list's own action.
  await page.getByRole("main").getByRole("button", { name: "Add album" }).click();
  // "Add album" opens capture; manual entry is a step further (DS-48).
  await page
    .getByRole("dialog", { name: "Add albums" })
    .getByRole("button", { name: "Enter manually" })
    .click();
  const form = page.getByRole("dialog", { name: "New album" });
  await expect(form.getByRole("combobox", { name: "List", exact: true })).toHaveText("Doom");
  // The release type starts at Album (TON-161), and Single is a choice after EP (TON-164).
  const releaseType = form.getByRole("radiogroup", { name: "Release type" });
  await expect(releaseType.getByRole("radio", { name: "Album" })).toBeChecked();
  await expect(releaseType.getByRole("radio")).toHaveText([
    "Album",
    "EP",
    "Single",
    "Compilation",
    "Unknown",
  ]);
  await form.getByRole("textbox", { name: "Title" }).fill("Nightfall");
  await form.getByRole("textbox", { name: "Artist" }).fill("Candlemass");
  await form.getByRole("textbox", { name: "Original release year" }).fill("1987");
  await page.keyboard.press("Meta+Enter");
  await expect(form).toHaveCount(0);
  await expect(rowOf(page, "Doom", "Nightfall")).toContainText("1987");
  await saved(page);

  // Below the rows in Editing mode; a live album with only a recording range.
  await page.getByRole("main").getByRole("button", { name: "Add album" }).click();
  // "Add album" opens capture; manual entry is a step further (DS-48).
  await page
    .getByRole("dialog", { name: "Add albums" })
    .getByRole("button", { name: "Enter manually" })
    .click();
  await form.getByRole("textbox", { name: "Title" }).fill("Live Evil");
  await form.getByRole("textbox", { name: "Artist" }).fill("Black Sabbath");
  await form.getByRole("switch", { name: "Live" }).click();
  await form.getByRole("textbox", { name: "Recording year or range" }).fill("1982");
  await form.getByRole("button", { name: "Add album" }).click();
  await expect(rowOf(page, "Doom", "Live Evil")).toContainText("rec. 1982");
  await saved(page);

  // A failed save's Edit opens the form as it was entered; saving it makes the failure go.
  await page.evaluate(
    (yearless) => {
      window.tonarisSync?.albums
        .insert(yearless)
        .when("settled")
        .catch(() => {});
    },
    album("Epicus", { releaseType: null, originalYear: null }),
  );
  const failed = toasts(page).filter({ hasText: "Couldn't save 'Epicus'" });
  await expect(failed).toBeVisible();
  await page.keyboard.press("F6");
  await failed.getByRole("button", { name: "Edit" }).click();
  await expect(form.getByRole("textbox", { name: "Title" })).toHaveValue("Epicus");
  await form.getByRole("textbox", { name: "Original release year" }).fill("1986");
  await form.getByRole("button", { name: "Add album" }).click();
  await expect(failed).toHaveCount(0);
  await saved(page);
});

test("an album has its own page", async ({ page }) => {
  await signIn(page, accounts.albumPage);
  await live(page);
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(page, [nightfall]);
  await page.goto(`/a/${nightfall.id}`);
  await live(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nightfall");
  await expect(page).toHaveTitle(/^Nightfall/);
  await expect(page.getByRole("main")).toContainText("Candlemass");
  await expect(page.getByRole("main").getByRole("link", { name: "Unsorted" })).toBeVisible();

  await page.goto(`/a/${"0".repeat(8)}-0000-7000-8000-${"0".repeat(12)}`);
  await live(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not available");
});

test("the release type's five choices fit, also in the panel at its narrowest (TON-165)", async ({
  page,
}) => {
  await signIn(page, accounts.releaseTypeFit);
  await live(page);
  const doom = await created(page, "Doom");
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(page, [nightfall], doom.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/l/${doom.id}?album=${nightfall.id}`);
  await live(page);
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();
  const group = inspector(page).getByRole("radiogroup", { name: "Release type" });
  // Each label inside its option, and the control inside the panel.
  const spills = () =>
    group.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const panel = element.closest("aside")?.getBoundingClientRect();
      const labels = [...element.querySelectorAll('[role="radio"]')].flatMap((radio) => {
        const range = document.createRange();
        range.selectNodeContents(radio);
        const text = range.getBoundingClientRect();
        const option = radio.getBoundingClientRect();
        return text.left < option.left || text.right > option.right ? [radio.textContent] : [];
      });
      return panel && box.right > panel.right ? [...labels, "the panel"] : labels;
    });
  await expect(group.getByRole("radio")).toHaveText([
    "Album",
    "EP",
    "Single",
    "Compilation",
    "Unknown",
  ]);
  expect(await spills()).toEqual([]);
  const edge = page.getByRole("separator", { name: "Resize album panel" });
  await edge.focus();
  await page.keyboard.press("Home");
  await expect(edge).toHaveAttribute("aria-valuenow", "320");
  expect(await spills()).toEqual([]);
});
