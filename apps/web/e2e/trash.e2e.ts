// Deleting folders and lists in a real browser (AC-27 in part; FR-01.11 to FR-01.13, DS-50, DS-28, DS-78): ⌫ moves a
// focused list to Trash at once, its album entering Unsorted, and Undo brings it back; a folder asks first, with its
// hierarchy, Cancel focused; Editing mode's header deletes the list on view. Each test has its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, toasts } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const tree = (page: Page) => page.getByRole("tree");
const item = (page: Page, name: string) =>
  tree(page).getByRole("treeitem", { name: new RegExp(`^${name}`) });
const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
});

test("⌫ moves a list to Trash, its album to Unsorted, and Undo brings it back", async ({
  page,
}) => {
  await signIn(page, accounts.trashList);
  await live(page);
  const doom = container("list", "Doom");
  const later = container("list", "Later");
  await insert(page, doom, later);
  const dopesmoker = album("Dopesmoker", { artistCredit: "Sleep", originalYear: 1999 });
  await added(page, [dopesmoker], doom.id);
  await saved(page);

  await item(page, "Doom").focus();
  await page.keyboard.press("Backspace");
  await expect(item(page, "Doom")).toHaveCount(0);
  const toast = toasts(page).filter({ hasText: "1 list moved to Trash" });
  await expect(toast).toBeVisible();
  await saved(page);
  await page.goto("/unsorted");
  await live(page);
  await expect(page.getByRole("main")).toContainText("Dopesmoker");

  // Undo recovers it, with its album.
  await item(page, "Later").focus();
  await page.keyboard.press("Backspace");
  await toasts(page)
    .filter({ hasText: "1 list moved to Trash" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(item(page, "Later")).toBeVisible();
  await saved(page);
  await page.reload();
  await live(page);
  await expect(item(page, "Later")).toBeVisible();
  await expect(item(page, "Doom")).toHaveCount(0);
});

test("a folder asks first, naming what goes, and the header deletes the list on view", async ({
  page,
}) => {
  await signIn(page, accounts.trashFolder);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  const sludge = container("list", "Sludge", metal.id);
  const later = container("list", "Later");
  await insert(page, metal, doom, sludge, later);
  await saved(page);

  await item(page, "Metal").focus();
  await page.keyboard.press("Backspace");
  const confirm = page.getByRole("alertdialog", { name: "Delete folder 'Metal'?" });
  await expect(confirm).toContainText("The folder and 2 lists inside it: Doom, Sludge");
  await expect(confirm).toContainText("Albums stay in their other lists or in Unsorted.");
  await expect(confirm).toContainText("Recoverable from Trash for 30 days.");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(item(page, "Metal")).toBeVisible();

  await item(page, "Metal").focus();
  await page.keyboard.press("Backspace");
  await confirm.getByRole("button", { name: "Move 1 folder and 2 lists to Trash" }).click();
  await expect(item(page, "Metal")).toHaveCount(0);
  await saved(page);

  // The list on view, from Editing mode's header; its page goes to the collection.
  await page.goto(`/l/${later.id}`);
  await live(page);
  // ⌫ already switched to Editing mode, which stays on (DS-45).
  await page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Delete list" }).click();
  await expect(page).toHaveURL("/c");
  await expect(item(page, "Later")).toHaveCount(0);
  await saved(page);
  await page.reload();
  await live(page);
  for (const name of ["Metal", "Doom", "Sludge", "Later"]) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(item(page, name)).toHaveCount(0);
  }
});
