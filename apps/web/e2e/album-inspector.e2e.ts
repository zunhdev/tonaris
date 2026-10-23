// The album inspector and manual entry in a real browser (FR-02.4, FR-02.6, FR-03.1, FR-01.6, FR-01.8; DS-46, DS-47,
// DS-32): opening an album by click with `?album=`, J moving it and Esc closing it; editing its chronology in
// Editing mode, shown in every list, and a refused choice; taking it out of its only list with Undo, and adding it
// to one with L; the manual entry form's required information, saving into the current list, and asking before
// discarding; and an album's own page. Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  added,
  album,
  announcements,
  created,
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
  });
  await added(page, [rainbow, evil], doom.id);
  await page.evaluate(
    async ({ listId, albumId }) => {
      await window.tonarisSync?.memberships.insert({
        listId,
        albumId,
        addedAt: new Date().toISOString(),
      }).isPersisted.promise;
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
      await window.tonarisSync?.memberships.insert({
        listId,
        albumId,
        addedAt: new Date().toISOString(),
      }).isPersisted.promise;
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
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await picker.getByRole("button", { name: "Epic" }).click();
  await expect(picker).toHaveCount(0);
  await expect(lists(page).getByRole("link", { name: "Epic" })).toBeVisible();
  await expect(lists(page).getByRole("link", { name: "Doom" })).toBeVisible();
  await saved(page);
});

test("the form reports missing required information, saves nothing, and asks before discarding", async ({
  page,
}) => {
  await signIn(page, accounts.entryRequired);
  await live(page);
  await page.goto("/c");
  await live(page);

  await page.getByRole("button", { name: "Add album" }).click();
  const form = page.getByRole("dialog", { name: "New album" });
  await expect(form.getByRole("textbox", { name: "Title" })).toBeFocused();
  await Promise.all(
    ["Artwork", "Links", "Custom fields", "List"].map((field) =>
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
  const form = page.getByRole("dialog", { name: "New album" });
  await expect(form.getByRole("combobox", { name: "List" })).toHaveValue(doom.id);
  await form.getByRole("textbox", { name: "Title" }).fill("Nightfall");
  await form.getByRole("textbox", { name: "Artist" }).fill("Candlemass");
  await form.getByRole("textbox", { name: "Original release year" }).fill("1987");
  await page.keyboard.press("Meta+Enter");
  await expect(form).toHaveCount(0);
  await expect(rowOf(page, "Doom", "Nightfall")).toContainText("1987");
  await saved(page);

  // Below the rows in Editing mode; a live album with only a recording range.
  await page.getByRole("main").getByRole("button", { name: "Add album" }).click();
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
      window.tonarisSync?.albums.insert(yearless).isPersisted.promise.catch(() => {});
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
