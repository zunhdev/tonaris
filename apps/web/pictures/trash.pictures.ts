// Pictures for Help's Trash, saving and account pages (TON-312): deleting an album, Trash, going offline, and
// Settings' Profile, Data and Account. Last in the run: it deletes things.

import { expect, test } from "@playwright/test";

import { idOf, ids, open, shot, visit } from "./support";

test("Settings: your profile", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 860 });
  await visit(page, "/settings/profile");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: /Favorite/ })).toBeVisible();
  await shot(page, "account-profile", { of: main, pad: 0 });
});

test("Settings: your data", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await visit(page, "/settings/data");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Download your data" })).toBeVisible();
  await shot(page, "account-data", { of: main, pad: 0 });
  await shot(page, "reference-usage", { of: main.getByRole("region", { name: "Usage" }), pad: 16 });
});

test("deleting your account asks first", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await visit(page, "/settings/account");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).first();
  await expect(dialog).toBeVisible();
  await shot(page, "account-delete-account", { of: dialog });
});

test("offline", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Discoveries 2026")}`);
  await page.context().setOffline(true);
  await expect(page.getByText(/Offline/).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, "saving-offline");
  await page.context().setOffline(false);
});

test("deleting an album asks first, naming its lists", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}?album=${idOf(found, "Night Bus Hymns")}`);
  await page.keyboard.press("e");
  await page.keyboard.press("ControlOrMeta+Backspace");
  const question = page.getByRole("alertdialog");
  await expect(question).toBeVisible();
  await shot(page, "trash-delete-album", { of: question });
  await question.getByRole("button", { name: "Cancel" }).click();
});

test("Trash, with a folder, a list and an album in it", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  const found = await ids(page);
  const tree = page.getByRole("tree", { name: "Collection" });
  const item = (name: string) => tree.getByRole("treeitem", { name: new RegExp(`^${name}\\b`) });

  // A list on its own, then its folder with the rest, then an album from Unsorted. Opening the list opens Moods.
  await visit(page, `/l/${idOf(found, "Rainy Sundays")}`);
  await page.keyboard.press("e");
  await item("Rainy Sundays").focus();
  await page.keyboard.press("Backspace");
  await expect(item("Rainy Sundays")).toBeHidden();
  await item("Moods").focus();
  await page.keyboard.press("Backspace");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /to Trash$/ })
    .click();
  await expect(item("Moods")).toBeHidden();
  await visit(page, `/unsorted?album=${idOf(found, "Midnight Ferry")}`);
  await page.keyboard.press("ControlOrMeta+Backspace");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /to Trash$/ })
    .click();

  await visit(page, "/trash");
  const table = page
    .getByRole("main")
    .getByRole("grid")
    .or(page.getByRole("main").getByRole("table"))
    .first();
  await expect(table.getByText("Midnight Ferry")).toBeVisible();
  await shot(page, "trash-view", { of: table, pad: 16 });
});
