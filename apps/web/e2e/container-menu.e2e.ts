// A folder's or list's menu in the sidebar, and Rename in the header (TON-117, DS-27): with the pointer, a row's ⋯
// opens New list and New folder, made inside a folder and beside a list (TON-120), then Rename, Move to…, Share… and
// Delete…, each running its shortcut's command on that row; from the keyboard, Shift+F10 opens the same menu, and
// Escape gives the focus back to the row. In Editing mode, the header's Rename opens the name's editor in the
// sidebar. The "+" beside Collection makes them at the top level. Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { list, live, saved, toasts, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const tree = (page: Page) => page.getByRole("tree", { name: "Collection" });
const item = (page: Page, name: string) =>
  tree(page).getByRole("treeitem", { name: new RegExp(`^${name}\\b`) });
const menu = (page: Page, name: string) => page.getByRole("menu", { name: `Actions for ${name}` });

/** A folder and a list at the top level, saved. */
async function folderAndList(page: Page) {
  const folder = { ...list("Metal"), kind: "folder" as const };
  const doom = list("Doom");
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).isPersisted.promise;
    },
    [folder, doom],
  );
  return { folder, doom };
}

async function openMenu(page: Page, name: string) {
  const row = item(page, name);
  await row.hover();
  await row.locator('[data-slot="row-menu"]').click();
  await expect(menu(page, name)).toBeVisible();
}

test("a row's ⋯ renames, moves and deletes the folder or list it's on", async ({ page }) => {
  await signIn(page, accounts.rowMenu);
  await live(page);
  await folderAndList(page);
  await page.goto("/c");
  await live(page);

  // The ⋯ shows on hover only.
  await expect(item(page, "Doom").locator('[data-slot="row-menu"]')).toBeHidden();
  await openMenu(page, "Doom");
  await expect(menu(page, "Doom").getByRole("menuitem")).toHaveText([
    "New listN",
    "New folder⇧N",
    "RenameF2",
    "Move to…M",
    "Share…⇧S",
    "Delete…⌫",
  ]);
  expect(await violations(page, '[data-slot="dropdown-menu-content"]')).toEqual([]);

  // Rename: the name's editor, in place.
  await menu(page, "Doom")
    .getByRole("menuitem", { name: /^Rename/ })
    .click();
  const editor = tree(page).getByRole("textbox");
  await expect(editor).toHaveValue("Doom");
  await editor.fill("Funeral doom");
  await editor.press("Enter");
  await saved(page);
  await expect(item(page, "Funeral doom")).toBeVisible();

  // Move to…: the move dialog for that list.
  await openMenu(page, "Funeral doom");
  await menu(page, "Funeral doom")
    .getByRole("menuitem", { name: /^Move to/ })
    .click();
  const picker = page.getByRole("dialog", { name: "Move 'Funeral doom' to…" });
  await picker.getByRole("button", { name: "Metal" }).click();
  await saved(page);
  await expect(picker).toHaveCount(0);
  await item(page, "Metal").press("ArrowRight");
  await expect(item(page, "Funeral doom")).toHaveAttribute("aria-level", "2");

  // Delete…: a list goes to Trash at once, with Undo.
  await openMenu(page, "Funeral doom");
  await menu(page, "Funeral doom")
    .getByRole("menuitem", { name: /^Delete/ })
    .click();
  await expect(toasts(page).filter({ hasText: "1 list moved to Trash" })).toBeVisible();
  await expect(item(page, "Funeral doom")).toHaveCount(0);
});

test("Shift+F10 opens a row's menu, and Escape gives the focus back to the row", async ({
  page,
}) => {
  await signIn(page, accounts.rowMenuKeys);
  await live(page);
  await folderAndList(page);
  await page.goto("/c");
  await live(page);

  await item(page, "Metal").focus();
  await page.keyboard.press("Shift+F10");
  // The menu takes the focus once it's open; then the arrows move through its items.
  await expect(menu(page, "Metal")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page, "Metal").getByRole("menuitem", { name: /^New list/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page, "Metal")).toHaveCount(0);
  await expect(item(page, "Metal")).toBeFocused();
});

test("in Editing mode, the header's Rename opens the name's editor in the sidebar", async ({
  page,
}) => {
  await signIn(page, accounts.headerRename);
  await live(page);
  const { doom } = await folderAndList(page);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  const rename = page.getByRole("button", { name: "Rename", exact: true });
  await expect(rename).toHaveCount(0);

  await page.keyboard.press("e");
  await rename.click();
  const editor = tree(page).getByRole("textbox");
  await expect(editor).toBeFocused();
  await editor.fill("Drone doom");
  await editor.press("Enter");
  await saved(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Drone doom");
});

test("a folder's menu makes a new list inside it, a list's a folder beside it, and the \"+\" at the top", async ({
  page,
}) => {
  await signIn(page, accounts.rowMenuCreate);
  await live(page);
  // The list 'Doom' inside the folder 'Metal'.
  const folder = { ...list("Metal"), kind: "folder" as const };
  const doom = { ...list("Doom"), parentId: folder.id };
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).isPersisted.promise;
    },
    [folder, doom],
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);
  const editor = tree(page).getByRole("textbox");

  // A folder's New list: inside it.
  await openMenu(page, "Metal");
  await menu(page, "Metal")
    .getByRole("menuitem", { name: /^New list/ })
    .click();
  await expect(editor).toBeFocused();
  await editor.fill("Sludge");
  await editor.press("Enter");
  await saved(page);
  await expect(item(page, "Sludge")).toHaveAttribute("aria-level", "2");

  // A list's New folder: beside it, in its folder.
  await openMenu(page, "Doom");
  await menu(page, "Doom")
    .getByRole("menuitem", { name: /^New folder/ })
    .click();
  await expect(editor).toBeFocused();
  await editor.fill("Drone");
  await editor.press("Enter");
  await saved(page);
  await expect(item(page, "Drone")).toHaveAttribute("aria-level", "2");

  // The "+" beside Collection: at the top level, though a list in 'Metal' is on view.
  await page.getByRole("button", { name: "New list or folder" }).click();
  const plus = page.getByRole("menu");
  await expect(plus.getByRole("menuitem")).toHaveText(["New list", "New folder"]);
  await plus.getByRole("menuitem", { name: "New list" }).click();
  await expect(editor).toBeFocused();
  await editor.fill("Later");
  await editor.press("Enter");
  await saved(page);
  await expect(item(page, "Later")).toHaveAttribute("aria-level", "1");
});
