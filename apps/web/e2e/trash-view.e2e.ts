// The Trash view in a real browser (DS-55, DS-56, DS-57; AC-27 to AC-29, AC-31): units with their contents, expiry
// and former place; a folder's contents read-only; R restoring by keyboard; an album restored with the entry it
// couldn't bring back reported; permanent deletion and Empty Trash, confirmed; and the local filter. Each test has
// its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, toasts } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const item = (page: Page, name: string) =>
  page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}`) });
const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description: null });
const trash = (page: Page) => page.getByRole("table", { name: "Trash" });
const unitRow = (page: Page, name: string) =>
  trash(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) });

test("a folder's unit shows its contents read-only, and R restores it", async ({ page }) => {
  await signIn(page, accounts.trashViewFolders);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  const sludge = container("list", "Sludge", metal.id);
  await insert(page, metal, doom, sludge);
  await saved(page);
  await item(page, "Metal").focus();
  await page.keyboard.press("Backspace");
  await page
    .getByRole("alertdialog", { name: "Delete folder 'Metal'?" })
    .getByRole("button", { name: /^Move/ })
    .click();
  await saved(page);

  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL("/trash");
  const row = unitRow(page, "Metal");
  await expect(row).toContainText("Folder · 2 lists");
  await expect(row).toContainText("Expires in 30 days");
  await expect(row).toContainText("Collection");

  // Its contents, read-only.
  await row.getByRole("button", { name: "Metal" }).press("Enter");
  await expect(trash(page)).toContainText(
    "Part of 'Metal' — restore or delete the folder to act on these.",
  );
  await expect(trash(page)).toContainText("Doom");
  await expect(trash(page).getByRole("button", { name: /Doom/ })).toHaveCount(0);

  // The filter narrows the table.
  await page.getByRole("textbox", { name: "Filter by name" }).fill("zzz");
  await expect(page.getByRole("main")).toContainText("Nothing in Trash matches 'zzz'.");
  await page.getByRole("textbox", { name: "Filter by name" }).fill("met");
  await expect(row).toBeVisible();

  // R on the row's focus restores it.
  await row.getByRole("button", { name: "Restore" }).focus();
  await page.keyboard.press("r");
  await expect(toasts(page).filter({ hasText: "Restored 'Metal'" })).toBeVisible();
  await expect(item(page, "Metal")).toBeVisible();
  await saved(page);
  await page.getByRole("textbox", { name: "Filter by name" }).fill("");
  await expect(page.getByRole("main")).toContainText(
    "Nothing in Trash. Deleted items stay here for 30 days.",
  );
});

test("an album comes back reporting a list in Trash; deleting for good and emptying are confirmed", async ({
  page,
}) => {
  await signIn(page, accounts.trashViewAlbums);
  await live(page);
  const doom = container("list", "Doom");
  const later = container("list", "Later");
  await insert(page, doom, later);
  const dopesmoker = album("Dopesmoker", { artistCredit: "Sleep", originalYear: 1999 });
  const holy = album("Holy Mountain", { artistCredit: "Sleep", originalYear: 1992 });
  await added(page, [dopesmoker, holy], doom.id);
  await page.evaluate(
    async (entry) => {
      await window.tonarisSync?.memberships.insert(entry).isPersisted.promise;
    },
    { listId: later.id, albumId: dopesmoker.id, addedAt: new Date().toISOString() },
  );
  await saved(page);

  // Dopesmoker and Holy Mountain to Trash, then Later.
  for (const each of [dopesmoker, holy]) {
    // oxlint-disable-next-line no-await-in-loop
    await page.evaluate(async (id) => {
      await window.tonarisSync?.trash.deleteAlbum(id).transaction.isPersisted.promise;
    }, each.id);
  }
  await item(page, "Later").focus();
  await page.keyboard.press("Backspace");
  await saved(page);

  await page.goto("/trash");
  await live(page);
  await expect(unitRow(page, "Dopesmoker")).toContainText("Album");
  await expect(unitRow(page, "Dopesmoker")).toContainText("Sleep");

  await unitRow(page, "Dopesmoker").getByRole("button", { name: "Restore" }).click();
  const notice = toasts(page).filter({ hasText: "Restored · 1 membership skipped" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Details" }).click();
  const report = page.getByRole("dialog", { name: "Skipped while restoring 'Dopesmoker'" });
  await expect(report).toContainText("The list is in Trash · was in 'Later'");
  await report.getByRole("button", { name: "Done" }).click();
  await saved(page);

  // Holy Mountain, for good.
  await unitRow(page, "Holy Mountain").getByRole("button", { name: "Delete permanently…" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Permanently delete 'Holy Mountain'?" });
  await expect(confirm).toContainText("Frees 1 album slot.");
  await expect(confirm).toContainText("This can't be undone.");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Permanently delete 1 item" }).click();
  await expect(unitRow(page, "Holy Mountain")).toHaveCount(0);
  await saved(page);

  // Empty Trash takes the rest: Later.
  await page.getByRole("button", { name: "Empty Trash…" }).click();
  const empty = page.getByRole("alertdialog", { name: "Empty Trash?" });
  await expect(empty).toContainText("1 list");
  await empty.getByRole("button", { name: "Permanently delete 1 item" }).click();
  await expect(page.getByRole("main")).toContainText("Nothing in Trash.");
  await saved(page);
  await page.reload();
  await live(page);
  await expect(page.getByRole("main")).toContainText("Nothing in Trash.");
  await expect(page.getByRole("button", { name: "Empty Trash…" })).toBeDisabled();
});
