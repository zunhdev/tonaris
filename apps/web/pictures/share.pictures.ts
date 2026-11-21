// Pictures for Help's Share pages (TON-311): the sharing dialog, turning a link off, a move that changes who sees a
// list, a list shared with Robin, Sam editing Robin's Jazz, and Mira's page in People.

import { expect, type Page, test } from "@playwright/test";

import { idOf, ids, open, shot, visit } from "./support";

const item = (page: Page, name: string) =>
  page
    .getByRole("tree", { name: "Collection" })
    .getByRole("treeitem", { name: new RegExp(`^${name}\\b`) });

test("the sharing dialog for a folder shared with Sam", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/f/${idOf(await ids(page), "Jazz")}`);
  await page.keyboard.press("Shift+S");
  const dialog = page.getByRole("dialog", { name: /Share/ });
  await expect(dialog).toBeVisible();
  await shot(page, "share-dialog", { of: dialog });
});

test("turning a link off asks first", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Late night")}`);
  await page.keyboard.press("Shift+S");
  const dialog = page.getByRole("dialog", { name: /Share/ });
  await dialog.getByRole("switch", { name: /Link sharing/ }).click();
  await expect(dialog.getByRole("button", { name: "Turn off" })).toBeVisible();
  await shot(page, "share-turn-off-link", { of: dialog });
});

test("a move that changes who sees a list is confirmed", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "To listen")}`);
  await item(page, "To listen").focus();
  await page.keyboard.press("m");
  const picker = page.getByRole("dialog", { name: "Move 'To listen' to…" });
  await picker.getByRole("option", { name: /Jazz/ }).click();
  const question = page.getByRole("alertdialog", { name: "Move 'To listen' to 'Jazz'?" });
  await expect(question).toBeVisible();
  await shot(page, "share-move-confirm", { of: question });
  await question.getByRole("button", { name: "Cancel" }).click();
});

test("a list shared with Robin", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 360 });
  await visit(page, "/c");
  await page
    .getByRole("tree", { name: "Collection" })
    .getByRole("treeitem", { name: /^Summer 2026/ })
    .click();
  const main = page.getByRole("main");
  await expect(main.getByText(/Shared by/).first()).toBeVisible();
  await shot(page, "share-shared-view", { of: main, pad: 0 });
});

test("Sam edits Robin's Jazz", async ({ browser }) => {
  const page = await open(browser, "sam");
  await page.setViewportSize({ width: 1440, height: 420 });
  await visit(page, "/c");
  await page
    .getByRole("tree", { name: "Collection" })
    .getByRole("treeitem", { name: /^Jazz/ })
    .click();
  await expect(
    page
      .getByRole("main")
      .getByText(/Shared by/)
      .first(),
  ).toBeVisible();
  await page.keyboard.press("e");
  const main = page.getByRole("main");
  await expect(main.getByText(/Can edit/).first()).toBeVisible();
  await shot(page, "share-editing", { of: main, pad: 0 });
});

test("Mira's page in People", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 560 });
  await visit(page, "/people");
  await page.getByRole("main").getByRole("link", { name: /Mira/ }).click();
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Mira", exact: true })).toBeVisible();
  await shot(page, "share-person-page", { of: main, pad: 0 });
});
