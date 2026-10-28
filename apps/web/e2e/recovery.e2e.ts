// Recovery prompts in a real browser (AC-27; FR-01.14 to FR-01.16, DS-56): a list whose folder went to Trash asks
// where to go, and Cancel leaves it in Trash; a list whose name was taken meanwhile asks for another, and nothing is
// renamed for the owner. Undo is the recovery here; the Trash view joins with TON-59. Each test has its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { insert, live, saved, toasts } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const item = (page: Page, name: string) =>
  page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}`) });
const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description: null });

/** Deletes the folder or list `name` from the sidebar with ⌫, confirming a folder. */
async function deleted(page: Page, name: string, folder = false) {
  await item(page, name).focus();
  await page.keyboard.press("Backspace");
  if (folder) {
    await page
      .getByRole("alertdialog", { name: `Delete folder '${name}'?` })
      .getByRole("button", { name: /^Move/ })
      .click();
  }
  await expect(item(page, name)).toHaveCount(0);
}

test("a list whose folder is in Trash asks where to go; Cancel leaves it, a choice restores it", async ({
  page,
}) => {
  await signIn(page, accounts.recoveryDestination);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  const sludge = container("list", "Sludge", metal.id);
  await insert(page, metal, doom, sludge);
  await saved(page);
  // Both lists are inside Metal: open it in the sidebar.
  await item(page, "Metal").focus();
  await page.keyboard.press("ArrowRight");

  // The newest toast comes first.
  const undo = (name: string) =>
    toasts(page)
      .filter({ hasText: "1 list moved to Trash" })
      .nth(name === "Doom" ? 1 : 0)
      .getByRole("button", { name: "Undo" });
  await deleted(page, "Doom");
  await deleted(page, "Sludge");
  await deleted(page, "Metal", true);
  await saved(page);

  await undo("Doom").click();
  const prompt = (name: string) => page.getByRole("dialog", { name: `Restore '${name}'` });
  await expect(prompt("Doom")).toContainText(
    "'Metal' is in Trash or no longer exists. Choose where to restore 'Doom'.",
  );
  await prompt("Doom").getByRole("button", { name: "Cancel" }).click();
  await expect(prompt("Doom")).toHaveCount(0);
  await expect(item(page, "Doom")).toHaveCount(0);

  await undo("Sludge").click();
  await prompt("Sludge").getByText("Collection").click();
  await prompt("Sludge").getByRole("button", { name: "Restore" }).click();
  await expect(item(page, "Sludge")).toHaveAttribute("aria-level", "1");
  await saved(page);
  await page.reload();
  await live(page);
  await expect(item(page, "Sludge")).toBeVisible();
  await expect(item(page, "Doom")).toHaveCount(0);
});

test("a taken name asks for another, and the one given is used", async ({ page }) => {
  await signIn(page, accounts.recoveryName);
  await live(page);
  const doom = container("list", "Doom");
  await insert(page, doom);
  await saved(page);

  await deleted(page, "Doom");
  const undo = toasts(page)
    .filter({ hasText: "1 list moved to Trash" })
    .getByRole("button", { name: "Undo" });
  await insert(page, container("list", "Doom"));
  await saved(page);
  await undo.click();
  const prompt = page.getByRole("dialog", { name: "Restore 'Doom'" });
  await expect(prompt).toContainText("'Collection' already has a list or folder named 'Doom'.");
  const name = prompt.getByRole("textbox", { name: "Name" });
  await expect(name).toBeFocused();
  // The same name again is refused, with the reason.
  await prompt.getByRole("button", { name: "Restore" }).click();
  await expect(prompt).toContainText("already");
  await name.fill("Doom (old)");
  await name.press("Enter");
  await expect(prompt).toHaveCount(0);
  await expect(item(page, "Doom \\(old\\)")).toBeVisible();
  await expect(toasts(page).filter({ hasText: "Restored 'Doom (old)'" })).toBeVisible();
  await saved(page);
  await page.reload();
  await live(page);
  await expect(item(page, "Doom \\(old\\)")).toBeVisible();
  await expect(item(page, "Doom$")).toHaveCount(0);
});
