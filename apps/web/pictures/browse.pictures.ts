// Pictures for Help's Browse and find pages (TON-309): View options, the album panel, search, a card's links and
// the keyboard shortcuts.

import { expect, test } from "@playwright/test";

import { idOf, ids, open, shot, visit } from "./support";

test("View options over a list of covers", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Late night")}`);
  await page.keyboard.press("v");
  const options = page.getByRole("dialog", { name: "View options" });
  await expect(options).toBeVisible();
  const card = page.getByRole("gridcell").filter({ hasText: "Night Bus Hymns" });
  await shot(page, "browse-view-options", { of: [options, card], pad: 16 });
});

test("the album panel", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1500 });
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}?album=${idOf(found, "Blue Hour Sessions")}`);
  const panel = page.getByRole("complementary", { name: "Album" });
  const card = page.getByRole("gridcell").filter({ hasText: "Blue Hour Sessions" });
  await shot(page, "browse-album-panel", { of: [card, panel], pad: 0 });
});

test("search finds albums as you type", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Search" });
  await expect(palette).toBeVisible();
  await page.getByRole("combobox", { name: "Search" }).fill("salt");
  await expect(palette.getByText("Saltwater Radio")).toBeVisible();
  await shot(page, "browse-search", { of: palette, pad: 16 });
});

test("a card's links, and +2", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Late night")}`);
  const card = (title: string) => page.getByRole("gridcell").filter({ hasText: title });
  await shot(page, "browse-card-links", {
    of: [card("Quiet Machines"), card("Low Tide Archive"), card("Field Notes")],
    pad: 16,
  });
});

test("the keyboard shortcuts", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1200 });
  await visit(page, "/c");
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await shot(page, "browse-shortcuts", { of: sheet, pad: 16 });
});
