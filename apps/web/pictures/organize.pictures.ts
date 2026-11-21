// Pictures for Help's Organize and Your own fields pages (TON-310): a folder's cards, an album's lists, Add to list…,
// selecting several albums, Move to…, the icon picker, a description, Editing mode, and custom fields in Settings
// and in the album panel.

import { expect, type Page, test } from "@playwright/test";

import { idOf, ids, open, shot, visit } from "./support";

const tree = (page: Page) => page.getByRole("tree", { name: "Collection" });
const item = (page: Page, name: string) =>
  tree(page).getByRole("treeitem", { name: new RegExp(`^${name}\\b`) });

test("a folder's lists as cards, beside the sidebar", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 520 });
  await visit(page, "/c");
  await visit(page, `/f/${idOf(await ids(page), "Moods")}`);
  const sidebar = page.getByRole("navigation", { name: "Sidebar" });
  const cards = page.getByRole("main").getByRole("gridcell");
  await shot(page, "organize-folder-cards", {
    of: [sidebar, cards.first(), cards.last()],
    pad: 24,
  });
});

test("an album's lists in the album panel", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1300 });
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}?album=${idOf(found, "Blue Hour Sessions")}`);
  const lists = page
    .getByRole("complementary", { name: "Album" })
    .getByRole("region", { name: "Lists" });
  await shot(page, "organize-album-lists", { of: lists, pad: 16 });
});

test("Add to list…", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}?album=${idOf(found, "Field Notes")}`);
  await page.keyboard.press("l");
  const dialog = page.getByRole("dialog", { name: "Add 'Field Notes' to a list" });
  await expect(dialog).toBeVisible();
  await shot(page, "organize-add-to-list", { of: dialog });
});

test("three albums selected, and the bar", async ({ browser }) => {
  const page = await open(browser, "owner");
  // Short, so the bar sits close under the three rows.
  await page.setViewportSize({ width: 1440, height: 380 });
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "To listen")}`);
  await page.keyboard.press("e");
  const grid = page.getByRole("grid", { name: "To listen" });
  for (const title of ["First Light Tapes", "Live at the Roundhouse", "Ojos de Agua"]) {
    // oxlint-disable-next-line no-await-in-loop
    await grid.getByRole("row").filter({ hasText: title }).getByRole("checkbox").check();
  }
  const bar = page.getByLabel("Selected albums");
  await expect(bar).toBeVisible();
  await shot(page, "organize-selection-bar", { of: [grid, bar], pad: 16 });
});

test("Move to…", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Rainy Sundays")}`);
  await item(page, "Rainy Sundays").focus();
  await page.keyboard.press("m");
  const dialog = page.getByRole("dialog", { name: "Move 'Rainy Sundays' to…" });
  await expect(dialog).toBeVisible();
  await shot(page, "organize-move-to", { of: dialog });
});

test("the icon picker", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await item(page, "Road trips").focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menu", { name: "Actions for Road trips" })
    .getByRole("menuitem", { name: "Icon…" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Icon for Road trips" });
  await expect(dialog).toBeVisible();
  await shot(page, "organize-icon-picker", { of: dialog });
});

test("a list's description, three lines and More", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Late night")}`);
  const more = page.getByRole("main").getByRole("button", { name: "More", exact: true }).first();
  await expect(more).toBeVisible();
  // The description's box: the button's parent holds the text and More.
  const description = more.locator("xpath=..");
  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumbs" });
  await shot(page, "organize-description", { of: [breadcrumbs, description], pad: 20 });
});

test("Editing mode, with a row's handle and checkbox", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "To listen")}`);
  await page.keyboard.press("e");
  const grid = page.getByRole("grid", { name: "To listen" });
  await grid.getByRole("row").filter({ hasText: "Live at the Roundhouse" }).hover();
  const header = page.getByRole("main").locator("header").first();
  await shot(page, "organize-edit-mode", { of: [header, grid], pad: 8 });
});

test("custom fields in Settings", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/settings/custom-fields");
  const main = page.getByRole("main");
  await expect(main.getByRole("row", { name: /Rating/ })).toBeVisible();
  await shot(page, "fields-settings", { of: main, pad: 0 });
});

test("a used field's type, locked", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/settings/custom-fields");
  const main = page.getByRole("main");
  const rating = main.getByRole("button", { name: "Rating", exact: true });
  await rating.click();
  await expect(rating).toHaveAttribute("aria-expanded", "true");
  await expect(main.getByRole("button", { name: "Create new field" })).toBeVisible();
  await shot(page, "fields-type-locked", { of: main, pad: 0 });
});

test("custom fields in the album panel", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1600 });
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}?album=${idOf(found, "Blue Hour Sessions")}`);
  await page.keyboard.press("e");
  const fields = page
    .getByRole("complementary", { name: "Album" })
    .getByRole("region", { name: "Custom fields" });
  await expect(fields.getByRole("button", { name: /Add field/ })).toBeVisible();
  await shot(page, "fields-album-panel", { of: fields, pad: 16 });
});
