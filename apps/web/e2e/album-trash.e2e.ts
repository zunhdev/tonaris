// Deleting an album from the collection in a real browser (AC-29 in part; FR-14.1, DS-50): ⌘⌫ on the focused album
// asks first, naming its lists; confirmed, it leaves every list and Unsorted for Trash. The inspector's Editing mode
// has the same action. Restoring arrives with the Trash view (TON-59).

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const grid = (page: Page, name: string) => page.getByRole("grid", { name });

test("⌘⌫ deletes the focused album after confirming; the inspector does too", async ({ page }) => {
  await signIn(page, accounts.albumTrash);
  await live(page);
  const doom: Container = {
    id: uuidv7(),
    kind: "list",
    parentId: null,
    name: "Doom",
    description: null,
  };
  await insert(page, doom);
  const dopesmoker = album("Dopesmoker", { artistCredit: "Sleep", originalYear: 1999 });
  const holy = album("Holy Mountain", { artistCredit: "Sleep", originalYear: 1992 });
  await added(page, [dopesmoker, holy], doom.id);
  await saved(page);

  await page.goto(`/l/${doom.id}`);
  await live(page);
  const row = grid(page, "Doom").getByRole("row").filter({ hasText: "Dopesmoker" });
  await row.getByRole("gridcell").first().focus();
  await page.keyboard.press("ControlOrMeta+Backspace");
  const confirm = page.getByRole("alertdialog", {
    name: "Delete 'Dopesmoker' from your collection?",
  });
  await expect(confirm).toContainText("It leaves 1 list: Doom.");
  await expect(confirm).toContainText("Recoverable from Trash for 30 days.");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Move to Trash" }).click();
  await expect(grid(page, "Doom").getByRole("row").filter({ hasText: "Dopesmoker" })).toHaveCount(
    0,
  );
  await saved(page);

  // From the inspector, in Editing mode.
  await grid(page, "Doom")
    .getByRole("row")
    .filter({ hasText: "Holy Mountain" })
    .getByRole("gridcell")
    .first()
    .click();
  await page.getByRole("button", { name: "Delete from collection…" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete 'Holy Mountain' from your collection?" })
    .getByRole("button", { name: "Move to Trash" })
    .click();
  await saved(page);
  await page.reload();
  await live(page);
  await expect(page.getByRole("main")).not.toContainText("Holy Mountain");
  await page.goto("/unsorted");
  await live(page);
  await expect(page.getByRole("main")).not.toContainText("Dopesmoker");
});
