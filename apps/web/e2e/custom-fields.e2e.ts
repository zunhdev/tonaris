// Custom fields on albums in a real browser (AC-11; FR-03.7, FR-03.8, FR-03.10; DS-26, DS-46, DS-47): a field
// created from "+ Add field" and applied, empty and shown as such; a refused number keeping its input; each type's
// value saved and shown after a reload; a removed field coming back empty; and manual entry with fields. Each test
// signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, live, saved, toasts } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const inspector = (page: Page) => page.getByRole("complementary", { name: "Album" });
const fieldsSection = (page: Page) =>
  inspector(page).getByRole("region", { name: "Custom fields" });
const mode = (page: Page, name: "View" | "Edit") =>
  page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name });

/** Opens the album in the inspector, in Editing mode. */
async function editing(page: Page, account: string, title = "Bleach") {
  await signIn(page, account);
  await live(page);
  const grunge = await created(page, "Grunge");
  const record = album(title, { artistCredit: "Nirvana", originalYear: 1989 });
  await added(page, [record], grunge.id);
  await page.goto(`/l/${grunge.id}?album=${record.id}`);
  await live(page);
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();
  return record;
}

/** Creates a field from the inspector's "+ Add field", which applies it. */
async function createField(page: Page, name: string, type: string, options: string[] = []) {
  await fieldsSection(page).getByRole("button", { name: "Add field" }).click();
  await page.getByRole("menuitem", { name: "Create field…" }).click();
  const dialog = page.getByRole("dialog", { name: "New field" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("combobox", { name: "Type" }).selectOption({ label: type });
  for (const [index, label] of options.entries()) {
    // oxlint-disable-next-line no-await-in-loop
    if (index > 0) await dialog.getByRole("button", { name: "Add option" }).click();
    // oxlint-disable-next-line no-await-in-loop
    await dialog.getByRole("textbox", { name: `Option ${index + 1}` }).fill(label);
  }
  await dialog.getByRole("button", { name: "Create field" }).click();
  await expect(dialog).toHaveCount(0);
}

test("a field is created and applied empty, refuses a non-number, and is removed and reapplied empty", async ({
  page,
}) => {
  await editing(page, accounts.fieldsApply);
  await createField(page, "Rating", "Number");
  const rating = fieldsSection(page).getByRole("textbox", { name: "Rating of 'Bleach'" });
  await expect(rating).toHaveValue("");
  await expect(rating).toHaveAttribute("placeholder", "Empty");

  await rating.fill("four");
  await rating.press("Enter");
  await expect(fieldsSection(page)).toContainText("Enter a number, such as 4.5.");
  await expect(rating).toHaveValue("four");
  await rating.fill("4.5");
  await rating.press("Enter");
  await saved(page);

  await mode(page, "View").click();
  await expect(fieldsSection(page)).toContainText("Rating");
  await expect(fieldsSection(page)).toContainText("4.5");
  await page.reload();
  await live(page);
  await expect(fieldsSection(page)).toContainText("4.5");

  // Removed, its value goes; applied again, it starts empty (FR-03.8).
  await mode(page, "Edit").click();
  await fieldsSection(page).getByRole("button", { name: "Remove Rating" }).click();
  await expect(toasts(page).filter({ hasText: "Removed Rating" })).toBeVisible();
  await expect(fieldsSection(page).getByRole("textbox")).toHaveCount(0);
  await fieldsSection(page).getByRole("button", { name: "Add field" }).click();
  await page.getByRole("menuitem", { name: "Rating" }).click();
  await expect(
    fieldsSection(page).getByRole("textbox", { name: "Rating of 'Bleach'" }),
  ).toHaveValue("");
  await saved(page);
});

test("each type's editor saves its value, and empty stays apart from No", async ({ page }) => {
  await editing(page, accounts.fieldsTypes);
  await createField(page, "Owned", "Yes/no");
  const owned = fieldsSection(page).getByRole("radiogroup", { name: "Owned of 'Bleach'" });
  await expect(owned.getByRole("radio", { name: "—" })).toBeChecked();
  await owned.getByRole("radio", { name: "No" }).click();

  await createField(page, "Mood", "Single choice", ["Calm", "Loud"]);
  await fieldsSection(page)
    .getByRole("combobox", { name: "Mood of 'Bleach'" })
    .selectOption({ label: "Loud" });

  await createField(page, "Tags", "Multiple choice", ["Grunge", "Debut", "Seattle"]);
  const add = fieldsSection(page).getByRole("combobox", {
    name: "Add an option to Tags of 'Bleach'",
  });
  await add.selectOption({ label: "Seattle" });
  await add.selectOption({ label: "Grunge" });

  await createField(page, "Bought", "Date");
  const date = fieldsSection(page).getByRole("textbox", { name: "Bought of 'Bleach'" });
  await date.fill("2026-02-30");
  await date.press("Enter");
  await expect(fieldsSection(page)).toContainText(
    "Enter a date as YYYY-MM-DD, such as 2026-10-28.",
  );
  await date.fill("2026-10-28");
  await date.press("Enter");

  await createField(page, "Notes", "Text");
  const notes = fieldsSection(page).getByRole("textbox", { name: "Notes of 'Bleach'" });
  await notes.fill("Recorded for $606.17");
  await notes.press("Enter");
  await saved(page);

  await page.reload();
  await live(page);
  await page.keyboard.press("e");
  const section = fieldsSection(page);
  await expect(section).toContainText("Owned");
  await expect(section).toContainText("No");
  await expect(section).toContainText("Loud");
  // Kept in the options' order.
  await expect(section).toContainText("Grunge, Seattle");
  await expect(section).toContainText("2026-10-28");
  await expect(section).toContainText("Recorded for $606.17");
});

test("manual entry saves an album with its fields", async ({ page }) => {
  await editing(page, accounts.fieldsEntry);
  await createField(page, "Rating", "Number");
  await saved(page);
  await page.keyboard.press("Escape");

  await page.getByRole("main").getByRole("button", { name: "Add album" }).click();
  await page
    .getByRole("dialog", { name: "Add albums" })
    .getByRole("button", { name: "Enter manually" })
    .click();
  const form = page.getByRole("dialog", { name: "New album" });
  await form.getByRole("textbox", { name: "Title" }).fill("Nevermind");
  await form.getByRole("textbox", { name: "Artist" }).fill("Nirvana");
  await form.getByRole("textbox", { name: "Original release year" }).fill("1991");
  await form.getByRole("combobox", { name: "Add field" }).selectOption({ label: "Rating" });
  const rating = form.getByRole("textbox", { name: "Rating" });
  await rating.fill("5");
  await rating.press("Enter");
  await form.getByRole("button", { name: "Add album" }).click();
  await expect(form).toHaveCount(0);
  await saved(page);

  await page
    .getByRole("grid", { name: "Grunge" })
    .getByRole("row")
    .filter({ hasText: "Nevermind" })
    .getByRole("gridcell")
    .first()
    .click();
  await expect(fieldsSection(page)).toContainText("Rating");
  await expect(
    fieldsSection(page).getByRole("textbox", { name: "Rating of 'Nevermind'" }),
  ).toHaveValue("5");
});
