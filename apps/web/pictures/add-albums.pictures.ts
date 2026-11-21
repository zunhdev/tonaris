// Pictures for Help's Add albums pages (TON-309): the Add albums dialog, the question when a link fits two albums,
// the New album form, the labels on covers, and the album panel in Editing mode. They work in To listen; each run
// seeds the demo afresh.

import { expect, test } from "@playwright/test";

import { idOf, ids, open, shot, visit } from "./support";

/** The link the pictures API answers with two albums called Harbour Songs (apps/api/src/pictures-capture.ts). */
const ambiguousLink = "https://open.spotify.com/album/6pIctur3sHarb0urS0ngs1";

test("Add albums, with links pasted", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "To listen")}`);
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Add albums" });
  await dialog
    .getByLabel("Links")
    .fill(
      [
        "https://open.spotify.com/album/0Pictur3sDem0L1nk00001",
        "https://music.apple.com/gb/album/1999000001",
        "https://open.qobuz.com/album/0demo00000001",
      ].join("\n"),
    );
  await shot(page, "add-albums-dialog", { of: dialog });
});

test("Which album is this?", async ({ browser }) => {
  const page = await open(browser, "owner");
  // Narrower, so the question's card isn't mostly empty.
  await page.setViewportSize({ width: 1024, height: 900 });
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "To listen")}`);
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Add albums" });
  await dialog.getByLabel("Links").fill(ambiguousLink);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  const question = page.getByText("Which album is this?");
  await expect(question).toBeVisible({ timeout: 15_000 });
  const row = page.locator('[data-slot="decision-card"]');
  await shot(page, "add-albums-which-album", { of: row, pad: 16 });
});

test("New album, filled in", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "To listen")}`);
  await page.keyboard.press("c");
  await page
    .getByRole("dialog", { name: "Add albums" })
    .getByRole("button", { name: "Enter manually" })
    .click();
  const form = page.getByRole("dialog", { name: "New album" });
  await form.getByLabel("Title").fill("Glass Weather");
  await form.getByLabel("Artist").fill("Petra Lindgren");
  await form.getByLabel("Original release year").fill("2020");
  await shot(page, "add-albums-new-album", { of: form });
});

test("labels on covers: Live and EP", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Late night")}`);
  const card = (title: string) => page.getByRole("gridcell").filter({ hasText: title });
  await shot(page, "add-albums-card-labels", {
    of: [
      card("Blue Hour Sessions"),
      card("Saltwater Radio"),
      card("Concrete Garden"),
      card("Quiet Machines"),
    ],
    pad: 16,
  });
});

test("the album panel in Editing mode", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1300 });
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}?album=${idOf(found, "Field Notes")}`);
  await page.keyboard.press("e");
  const panel = page.getByRole("complementary", { name: "Album" });
  await expect(panel.getByLabel("Artwork URL")).toBeVisible();
  await shot(page, "add-albums-panel-editing", { of: panel, pad: 0 });
});
