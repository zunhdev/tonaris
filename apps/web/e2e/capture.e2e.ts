// Link capture in a real browser (AC-06; FR-02.1–FR-02.5, FR-02.9–FR-02.11, FR-06.4; DS-47, DS-48, DS-84), against
// the browser-test API, which answers captures from fixtures (apps/api/src/capture-fixtures.ts). Pasting and the
// capture dialog; albums of each service and a track's album; Unsorted with Add to list; manual entry with the link
// kept, prefilled or after a failure; a failure kept across a reload; the decision card; a batch's panel and report;
// already in the list; and a kept link replaced from the inspector. Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  activity,
  created,
  insert,
  list as listNamed,
  live,
  saved,
  toasts,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

/** The fixture links, as `apps/api/src/capture-fixtures.ts` answers them. */
const links = {
  bleachSpotify: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
  bleachOtherSpotify: "https://open.spotify.com/album/0000000000000000000001",
  bleachTrackSpotify: "https://open.spotify.com/track/3oo3sYwFzKqVvnpQyiAkNx?si=abc",
  nevermindApple: "https://music.apple.com/us/album/nevermind/1440783617",
  inUteroQobuz: "https://open.qobuz.com/album/0060253780880",
  holyDiverTidal: "https://tidal.com/browse/album/77654321",
  // A track in the album, as YouTube Music's player gives it: the album's playlist is the link kept.
  brightFutureYouTube:
    "https://music.youtube.com/watch?v=00000000001&list=OLAK5uy_000000000000000000000000000000001&si=x",
  tidalTrack: "https://tidal.com/track/12345678",
  idealApple: "https://music.apple.com/us/album/1000000001",
  ambiguousApple: "https://music.apple.com/us/album/1000000002",
  slowSpotify: "https://open.spotify.com/album/0000000000000000000007",
  downSpotify: "https://open.spotify.com/album/0000000000000000000009",
};

test("each Add album button shows its key, C, in a tooltip", async ({ page }) => {
  await signIn(page, accounts.addAlbumKey);
  await live(page);
  const tooltip = page.locator('[data-slot="tooltip-content"]');

  const inSidebar = page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("button", { name: "Add album" });
  await expect(inSidebar).toHaveAttribute("aria-keyshortcuts", "C");
  await inSidebar.hover();
  await expect(tooltip).toHaveText("Add albumC");
  await expect(tooltip.locator("kbd")).toHaveText("C");
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  // An empty list's.
  const doom = listNamed("Doom");
  await insert(page, doom);
  await saved(page);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  const inEmptyList = page.getByRole("main").getByRole("button", { name: "Add album" });
  await expect(inEmptyList).toHaveAttribute("aria-keyshortcuts", "C");
  await inEmptyList.hover();
  await expect(tooltip).toHaveText("Add albumC");
});

/** Pastes `text` with nothing focused, as ⌘V would. */
async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((pasted) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", pasted);
    document.body.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  }, text);
}

const grid = (page: Page, name: string) => page.getByRole("grid", { name });
const rowOf = (page: Page, gridName: string, text: string) =>
  grid(page, gridName).getByRole("row").filter({ hasText: text });
const capturing = (page: Page) => page.getByRole("region", { name: "Albums being added" });
const captureRow = (page: Page, text: string) =>
  capturing(page).getByRole("listitem").filter({ hasText: text });
const form = (page: Page) => page.getByRole("dialog", { name: "New album" });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Album" });
const linksSection = (page: Page) => inspector(page).getByRole("region", { name: "Links" });

/** Opens the list `name`, made for the test, and waits for the stream. */
async function inList(page: Page, name: string) {
  const list = await created(page, name);
  await page.goto(`/l/${list.id}`);
  await live(page);
  return list;
}

test("album links of each service resolve into the list, pasted or added from the dialog, and a track adds its album", async ({
  page,
}) => {
  await signIn(page, accounts.captureList);
  await live(page);
  const grunge = await inList(page, "Grunge");

  await paste(page, links.bleachSpotify);
  await expect(rowOf(page, "Grunge", "Bleach")).toContainText("1989");
  // Pasting is an edit: Editing mode is on.
  await expect(
    page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }),
  ).toBeChecked();

  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Add albums" });
  await expect(dialog.getByRole("combobox", { name: "List" })).toHaveValue(grunge.id);
  await dialog
    .getByRole("textbox", { name: "Links" })
    .fill(
      [
        links.nevermindApple,
        links.inUteroQobuz,
        links.holyDiverTidal,
        links.brightFutureYouTube,
      ].join("\n"),
    );
  await page.keyboard.press("Meta+Enter");
  await expect(dialog).toHaveCount(0);
  for (const [title, year] of [
    ["Nevermind", "1991"],
    ["In Utero", "1993"],
    ["Holy Diver", "1983"],
    ["Bright Future", "2024"],
  ]) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(rowOf(page, "Grunge", title ?? "")).toContainText(year ?? "");
  }

  // A track's link adds the album it is on: here Bleach, already in the list.
  await paste(page, links.bleachTrackSpotify);
  await expect(toasts(page).filter({ hasText: "Already in this list" })).toBeVisible();
  await expect(grid(page, "Grunge").getByRole("row").filter({ hasText: "Bleach" })).toHaveCount(1);
  await saved(page);
});

test("a link pasted outside a list goes to Unsorted, and Add to list is offered", async ({
  page,
}) => {
  await signIn(page, accounts.captureRoot);
  await live(page);
  await created(page, "Grunge");
  await page.goto("/c");
  await live(page);

  await paste(page, links.bleachSpotify);
  const added = toasts(page).filter({ hasText: "Added 'Bleach' to Unsorted" });
  await expect(added).toBeVisible();
  await added.getByRole("button", { name: "Add to list…" }).click();
  await expect(page.getByRole("dialog", { name: "Add 'Bleach' to a list" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/unsorted");
  await live(page);
  await expect(rowOf(page, "Unsorted", "Bleach")).toContainText("Nirvana");
});

test("a Tidal track link and an unidentified Apple link go to manual entry, keeping the link", async ({
  page,
}) => {
  await signIn(page, accounts.captureManual);
  await live(page);
  await inList(page, "Later");

  await paste(page, links.tidalTrack);
  const track = captureRow(page, "tidal.com/track/12345678");
  await expect(track).toContainText(
    "A Tidal track link doesn't say which album it's on. Enter the album's details; the link is kept.",
  );
  await track.getByRole("button", { name: "Enter manually" }).click();
  await expect(form(page)).toContainText("The link is kept: tidal.com/track/12345678");
  await form(page).getByRole("textbox", { name: "Title" }).fill("Live Evil");
  await form(page).getByRole("textbox", { name: "Artist" }).fill("Black Sabbath");
  await form(page).getByRole("textbox", { name: "Original release year" }).fill("1982");
  await form(page).getByRole("button", { name: "Add album" }).click();
  await expect(rowOf(page, "Later", "Live Evil")).toContainText("1982");
  await expect(capturing(page)).toHaveCount(0);

  await paste(page, links.idealApple);
  await captureRow(page, "music.apple.com").getByRole("button", { name: "Enter manually" }).click();
  // Prefilled with Apple's title, artist and year.
  await expect(form(page).getByRole("textbox", { name: "Title" })).toHaveValue("Idéal");
  await expect(form(page).getByRole("textbox", { name: "Artist" })).toHaveValue("Trust");
  await expect(form(page).getByRole("textbox", { name: "Original release year" })).toHaveValue(
    "1983",
  );
  await form(page).getByRole("button", { name: "Add album" }).click();
  await expect(rowOf(page, "Later", "Idéal")).toContainText("1983");
  await saved(page);

  await rowOf(page, "Later", "Live Evil").getByRole("gridcell").first().click();
  await expect(linksSection(page).getByRole("link", { name: /Open in Tidal/ })).toHaveAttribute(
    "href",
    "https://tidal.com/track/12345678",
  );
});

test("a failure keeps its link across a reload and is entered manually with it; unsupported input is explained", async ({
  page,
}) => {
  await signIn(page, accounts.captureFailure);
  await live(page);
  await inList(page, "Later");

  await paste(page, links.downSpotify);
  const failed = captureRow(page, "0000000000000000000009");
  await expect(failed).toContainText(
    "Couldn't reach MusicBrainz. Try again, or enter the details manually.",
  );
  await expect(failed.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(failed.getByRole("button", { name: "Dismiss" })).toBeVisible();
  await expect(
    toasts(page).filter({ hasText: "Couldn't add an album from this link" }),
  ).toBeVisible();

  await page.reload();
  await live(page);
  await failed.getByRole("button", { name: "Enter manually" }).click();
  await expect(form(page).getByRole("textbox", { name: "Spotify link" })).toHaveValue(
    links.downSpotify,
  );
  await form(page).getByRole("textbox", { name: "Title" }).fill("Heaven and Hell");
  await form(page).getByRole("textbox", { name: "Artist" }).fill("Black Sabbath");
  await form(page).getByRole("textbox", { name: "Original release year" }).fill("1980");
  await form(page).getByRole("button", { name: "Add album" }).click();
  await expect(rowOf(page, "Later", "Heaven and Hell")).toContainText("1980");
  await expect(capturing(page)).toHaveCount(0);
  await saved(page);

  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Add albums" });
  await dialog.getByRole("textbox", { name: "Links" }).fill("Not a link at all");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(captureRow(page, "Not a link at all")).toContainText(
    "This doesn't look like a Spotify, Apple Music, Qobuz, Tidal or YouTube Music album or track link.",
  );
  await captureRow(page, "Not a link at all").getByRole("button", { name: "Dismiss" }).click();
  await expect(capturing(page)).toHaveCount(0);
});

test("a link that fits two albums asks which, and saves the one chosen", async ({ page }) => {
  await signIn(page, accounts.captureChoice);
  await live(page);
  await inList(page, "Dio");

  await paste(page, links.ambiguousApple);
  const card = capturing(page).getByRole("region", { name: "Which album is this?" });
  await expect(card.getByRole("button", { name: "Holy Diver" })).toBeVisible();
  await card.getByRole("button", { name: "The Last in Line" }).click();
  await expect(rowOf(page, "Dio", "The Last in Line")).toContainText("1984");
  await expect(capturing(page)).toHaveCount(0);
  await saved(page);
});

test("a batch shows its progress, and its report lists what failed", async ({ page }) => {
  await signIn(page, accounts.captureBatch);
  await live(page);
  await inList(page, "Mixed");

  await paste(
    page,
    [links.slowSpotify, links.bleachSpotify, links.downSpotify, "https://example.com/x"].join("\n"),
  );
  const panel = page.locator('[data-slot="capture-panel"]');
  await expect(panel).toContainText("Adding 4");
  await expect(captureRow(page, "0000000000000000000007")).toContainText("Resolving link…");
  await panel.getByRole("button").click();
  const report = activity(page).locator('[data-slot="batch-report"]');
  await expect(report).toContainText("2 saved · 2 failed", { timeout: 15_000 });
  await expect(panel).toHaveCount(0);
  await expect(rowOf(page, "Mixed", "Master of Reality")).toBeVisible();
  await expect(rowOf(page, "Mixed", "Bleach")).toBeVisible();
  await expect(report.getByRole("button", { name: "Enter manually" })).toHaveCount(2);
});

test("a kept link is reported, and replaced from the inspector", async ({ page }) => {
  await signIn(page, accounts.captureKept);
  await live(page);
  await inList(page, "Grunge");
  await paste(page, links.bleachSpotify);
  await expect(rowOf(page, "Grunge", "Bleach")).toBeVisible();
  await saved(page);

  await paste(page, links.bleachOtherSpotify);
  const kept = toasts(page).filter({ hasText: "Kept your existing Spotify link" });
  await expect(kept).toBeVisible();
  await expect(toasts(page).filter({ hasText: "Already in this list" })).toBeVisible();
  await kept.getByRole("button", { name: "Review" }).click();
  const notice = linksSection(page).locator('[data-slot="kept-link"]');
  await expect(notice).toContainText("Another Spotify link was found for this album");
  await notice.getByRole("button", { name: "Replace" }).click();
  await expect(linksSection(page).getByRole("link", { name: /Open in Spotify/ })).toHaveAttribute(
    "href",
    links.bleachOtherSpotify,
  );
  await expect(notice).toHaveCount(0);
});

test("a link pasted into a field is typed, not captured", async ({ page }) => {
  await signIn(page, accounts.captureField);
  await live(page);
  await inList(page, "Grunge");
  await page.keyboard.press("c");
  const field = page.getByRole("dialog", { name: "Add albums" }).getByRole("textbox", {
    name: "Links",
  });
  await field.focus();
  await page.evaluate((link) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", link);
    document.activeElement?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  }, links.bleachSpotify);
  await page.keyboard.press("Escape");
  await expect(capturing(page)).toHaveCount(0);
  await expect(grid(page, "Grunge")).toHaveCount(0);
});
