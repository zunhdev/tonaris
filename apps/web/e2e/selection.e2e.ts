// Selecting albums in a real browser (DS-21, DS-45, DS-50, DS-78; TON-231): X on the focused album selects it and
// switches to Editing mode, ⇧↓ adds the next, Esc clears; checkboxes with ⇧-click; and the selection bar's Add to
// list…, Remove from the list and Delete…, each one batch, the first two with Undo. The batch's "3 changes saved."
// follows each announcement at once, so the toasts are what is checked.

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Page } from "./support/test";
import { added, album, created, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const grid = (page: Page, name: string) => page.getByRole("grid", { name });
const rowOf = (page: Page, list: string, name: string) =>
  grid(page, list).getByRole("row").filter({ hasText: name });
const albumRows = (page: Page, list: string) =>
  grid(page, list)
    .getByRole("row")
    .filter({ hasNot: page.getByRole("columnheader") });
const bar = (page: Page) => page.getByRole("group", { name: "Selected albums" });

test("albums are selected by key and checkbox, and added, removed and deleted together", async ({
  page,
}) => {
  await signIn(page, accounts.albumSelection);
  await live(page);
  const doom = await created(page, "Doom");
  await created(page, "Stoner");
  await added(
    page,
    [album("Dopesmoker"), album("Holy Mountain"), album("Jerusalem"), album("Volume One")],
    doom.id,
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);
  const batches: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().startsWith(`${apiUrl}/v1/batches`))
      batches.push(request.url());
  });

  // Viewing shows no checkboxes; X selects the focused album and switches to Editing mode.
  await expect(grid(page, "Doom").getByRole("checkbox")).toHaveCount(0);
  await rowOf(page, "Doom", "Dopesmoker").getByRole("gridcell").first().focus();
  await page.keyboard.press("x");
  await expect(
    page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name: "Edit" }),
  ).toBeChecked();
  await expect(grid(page, "Doom").getByRole("checkbox")).toHaveCount(4);
  await expect(rowOf(page, "Doom", "Dopesmoker")).toHaveAttribute("aria-selected", "true");
  await expect(bar(page)).toContainText("1 album selected");

  // ⇧↓ adds the next ones; Esc clears them, and leaves the inspector closed.
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(bar(page)).toContainText("3 albums selected");
  await expect(rowOf(page, "Doom", "Jerusalem")).toHaveAttribute("aria-selected", "true");
  expect(await violations(page, "main")).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(bar(page)).toHaveCount(0);
  await expect(rowOf(page, "Doom", "Dopesmoker")).toHaveAttribute("aria-selected", "false");
  await expect(page).not.toHaveURL(/album=/);

  // A checkbox, then ⇧-click on another, selects the albums between.
  await rowOf(page, "Doom", "Holy Mountain").getByRole("checkbox").click();
  await rowOf(page, "Doom", "Volume One")
    .getByRole("checkbox")
    .click({ modifiers: ["Shift"] });
  await expect(bar(page)).toContainText("3 albums selected");
  await expect(rowOf(page, "Doom", "Dopesmoker")).toHaveAttribute("aria-selected", "false");

  // Add to list… adds all three to Stoner at once, with Undo.
  await bar(page).getByRole("button", { name: "Add to list…" }).click();
  const picker = page.getByRole("dialog", { name: "Add 3 albums to a list" });
  await picker.getByRole("combobox", { name: "Find a list" }).fill("Stoner");
  await page.keyboard.press("Enter");
  const notifications = page.getByRole("region", { name: "Notifications" });
  await expect(notifications.getByText("3 albums added to Stoner")).toBeVisible();
  await saved(page);

  // L does the same from the keyboard; Stoner holds them all, so it isn't offered.
  await rowOf(page, "Doom", "Jerusalem").getByRole("gridcell").first().focus();
  await page.keyboard.press("l");
  const again = page.getByRole("dialog", { name: "Add 3 albums to a list" });
  await expect(again).toContainText("They're all in every list already");
  // The dialog takes the focus with no field to give it, so Esc closes it and leaves the selection.
  await expect(again.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(again).toHaveCount(0);

  // ⌫ takes them out of Doom together; Undo puts them back.
  await rowOf(page, "Doom", "Jerusalem").getByRole("gridcell").first().focus();
  await expect(bar(page)).toContainText("3 albums selected");
  await page.keyboard.press("Backspace");
  await expect(albumRows(page, "Doom")).toHaveCount(1);
  await notifications
    .getByRole("dialog", { name: "3 albums removed from Doom" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(albumRows(page, "Doom")).toHaveCount(4);
  await saved(page);

  // ⌘⌫ deletes the selected ones after confirming, in one batch.
  await rowOf(page, "Doom", "Dopesmoker").getByRole("gridcell").first().focus();
  await page.keyboard.press("x");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(bar(page)).toContainText("2 albums selected");
  batches.length = 0;
  await page.keyboard.press("ControlOrMeta+Backspace");
  const confirm = page.getByRole("alertdialog", { name: "Delete 2 albums from your collection?" });
  await expect(confirm).toContainText("Dopesmoker, Holy Mountain.");
  await confirm.getByRole("button", { name: "Move 2 albums to Trash" }).click();
  await expect(albumRows(page, "Doom")).toHaveCount(2);
  await expect(bar(page)).toHaveCount(0);
  await saved(page);
  expect(batches).toHaveLength(1);
});
