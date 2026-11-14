// "Move to position…" in a real browser (DS-49, TON-230): from the palette, in a view in manual order, a number moves
// the focused album there, announced and kept; a number out of range is refused in place, and under another sort the
// command says why it can't run.

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Page } from "./support/test";
import { added, album, announcements, created, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const grid = (page: Page, name: string) => page.getByRole("grid", { name });
const rowOf = (page: Page, name: string) =>
  grid(page, "Doom").getByRole("row").filter({ hasText: name });
const titles = (page: Page) =>
  grid(page, "Doom")
    .getByRole("row")
    .filter({ hasNot: page.getByRole("columnheader") })
    .locator('[data-cell$=":0"]');
const command = (page: Page) =>
  page
    .getByRole("dialog", { name: "Search" })
    .getByRole("group", { name: "Commands", exact: true })
    .getByRole("option", { name: /Move to position/ });

async function chooseSort(page: Page, sort: string): Promise<void> {
  await page.getByRole("button", { name: "View", exact: true }).click();
  const radio = page
    .getByRole("dialog", { name: "View options" })
    .getByRole("radiogroup", { name: "Sort" })
    .getByRole("radio", { name: sort });
  await radio.click();
  await expect(radio).toBeChecked();
  await page.keyboard.press("Escape");
}

test("Move to position… moves the focused album to the number typed, in manual order only", async ({
  page,
}) => {
  await signIn(page, accounts.moveToPosition);
  await live(page);
  const doom = await created(page, "Doom");
  await added(
    page,
    [album("Nightfall"), album("Ancient Dreams"), album("Tales of Creation")],
    doom.id,
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);

  // Under another sort, the command says why it can't run.
  await rowOf(page, "Tales of Creation").getByRole("gridcell").first().focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search" }).fill(">position");
  await expect(command(page)).toHaveAttribute("aria-disabled", "true");
  await expect(command(page)).toContainText("Rearranging works in manual order");
  await page.keyboard.press("Escape");

  await chooseSort(page, "Manual");
  await expect(titles(page)).toHaveText(["NNightfall", "AAncient Dreams", "TTales of Creation"]);
  await rowOf(page, "Tales of Creation").getByRole("gridcell").first().focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search" }).fill(">position");
  await command(page).click();
  const dialog = page.getByRole("dialog", { name: "Move 'Tales of Creation' to position" });
  await expect(dialog).toContainText("It's at 3 of 3.");
  const position = dialog.getByRole("textbox", { name: "Position" });
  await expect(position).toBeFocused();
  expect(await violations(page, '[role="dialog"]')).toEqual([]);

  // Out of range, it says so and moves nothing.
  await position.fill("4");
  await page.keyboard.press("Enter");
  await expect(dialog).toContainText("Enter a whole number from 1 to 3.");
  await expect(position).toHaveAttribute("aria-invalid", "true");

  await position.fill("1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(titles(page)).toHaveText(["TTales of Creation", "NNightfall", "AAncient Dreams"]);
  await expect(announcements(page).first()).toHaveText(
    "Moved Tales of Creation to position 1 of 3",
  );
  // The focus is back on the album, at its new place.
  await expect(rowOf(page, "Tales of Creation").getByRole("gridcell").first()).toBeFocused();
  await saved(page);
  await page.reload();
  await live(page);
  await expect(titles(page)).toHaveText(["TTales of Creation", "NNightfall", "AAncient Dreams"]);
});
