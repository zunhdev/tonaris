// Settings → Custom fields by keyboard (DS-60, DS-28; FR-03.6 to FR-03.18, X-07): creating a field, renaming it with a
// name in use refused inline, the type locked while an album uses the field, a type change that discards options
// asking first, options added, renamed and removed (an unused one at once, a chosen one through the confirmation),
// and deleting a field through the confirmation. Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type CustomField } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

/** Defines fields through the page's sync client. */
async function defined(page: Page, fields: CustomField[]) {
  await page.evaluate(async (rows) => {
    const sync = window.tonarisSync;
    if (!sync) throw new Error("No sync client on the page.");
    await sync.fields.insert(rows).isPersisted.promise;
  }, fields);
}

/** Applies a field to an album, with a value, through the page's sync client. */
async function applied(page: Page, albumId: string, fieldId: string, value: string | null) {
  await page.evaluate(
    async (row) => {
      const sync = window.tonarisSync;
      if (!sync) throw new Error("No sync client on the page.");
      await sync.fieldValues.insert(row).isPersisted.promise;
    },
    { albumId, fieldId, value },
  );
}

const settings = (page: Page) => page.getByRole("main");
const row = (page: Page, name: string) => settings(page).getByRole("button", { name, exact: true });

/** Tabs from the page's start until `target` has the focus, as a keyboard user would. */
async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>) {
  for (let presses = 0; presses < 60; presses += 1) {
    // oxlint-disable-next-line no-await-in-loop
    if (await target.evaluate((element) => element === document.activeElement)) return;
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press("Tab");
  }
  throw new Error("Never reached the target by Tab");
}

test("fields are created, renamed, locked while used, and retyped by keyboard", async ({
  page,
}) => {
  await signIn(page, accounts.settingsFields);
  await live(page);
  const rating = { id: uuidv7(), name: "Rating", type: "number" as const, options: [] };
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await defined(page, [rating]);
  await added(page, [bleach]);
  await applied(page, bleach.id, rating.id, null);

  await page.goto("/settings/custom-fields");
  await live(page);
  await expect(
    page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Custom fields" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(settings(page).getByRole("row", { name: /Rating/ })).toContainText(
    "Used by 1 album",
  );

  // Create "Mood" from New field, by keyboard.
  await tabTo(page, settings(page).getByRole("button", { name: "New field" }));
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New field" });
  await expect(dialog.getByRole("textbox", { name: "Name" })).toBeFocused();
  await page.keyboard.type("Mood");
  await dialog.getByRole("combobox", { name: "Type" }).selectOption({ label: "Single choice" });
  await dialog.getByRole("textbox", { name: "Option 1" }).fill("Calm");
  await dialog.getByRole("textbox", { name: "Option 1" }).press("Meta+Enter");
  await expect(dialog).toHaveCount(0);
  await saved(page);

  // The used field's type is locked, with the way out.
  await row(page, "Rating").focus();
  await page.keyboard.press("Enter");
  await expect(row(page, "Rating")).toHaveAttribute("aria-expanded", "true");
  const type = settings(page).getByRole("combobox", { name: "Type" });
  await expect(type).toBeDisabled();
  await expect(settings(page)).toContainText(
    "Used by 1 album. Create a new field of the type you need instead.",
  );
  await expect(settings(page).getByRole("button", { name: "Create new field" })).toBeVisible();

  // A name in use is refused inline, and Escape reverts it; another is saved with Enter.
  const name = settings(page).getByRole("textbox", { name: "Name" });
  await name.fill("mood");
  await name.press("Enter");
  await expect(settings(page)).toContainText("'Mood' already exists. Choose another name.");
  await name.press("Escape");
  await expect(name).toHaveValue("Rating");
  await name.fill("Score");
  await name.press("Enter");
  await expect(row(page, "Score")).toBeVisible();
  await row(page, "Score").press("Enter");
  expect(await violations(page, "main")).toEqual([]);

  // Mood is unused: changing it to Text lists the options it discards, and waits.
  await row(page, "Mood").focus();
  await page.keyboard.press("Enter");
  await settings(page).getByRole("combobox", { name: "Type" }).selectOption({ label: "Text" });
  await expect(settings(page).getByRole("alert")).toHaveText(
    "Changing to Text discards its options: Calm.",
  );
  await settings(page).getByRole("button", { name: "Keep options" }).press("Enter");
  await expect(settings(page).getByRole("combobox", { name: "Type" })).toHaveValue("single_choice");
  await settings(page).getByRole("combobox", { name: "Type" }).selectOption({ label: "Text" });
  await settings(page).getByRole("button", { name: "Change type" }).press("Enter");
  await expect(settings(page).getByRole("row", { name: /Mood/ }).first()).toContainText("Text");
  await saved(page);

  // Deleting always asks, even unused, with Cancel focused.
  await settings(page).getByRole("button", { name: "Delete field" }).press("Enter");
  const confirm = page.getByRole("alertdialog", { name: "Delete field 'Mood'?" });
  await expect(confirm).toContainText("No album uses it");
  await expect(confirm).toContainText(
    "This can't be undone — Trash and album restore won't bring it back.",
  );
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(confirm).toHaveCount(0);
  await expect(row(page, "Mood")).toHaveCount(0);
  await saved(page);
  await page.reload();
  await live(page);
  await expect(row(page, "Score")).toBeVisible();
  await expect(row(page, "Mood")).toHaveCount(0);
});

test("options are added, renamed and removed, a chosen one only once confirmed", async ({
  page,
}) => {
  await signIn(page, accounts.settingsOptions);
  await live(page);
  const [calm, loud] = [uuidv7(), uuidv7()];
  const mood = {
    id: uuidv7(),
    name: "Mood",
    type: "single_choice" as const,
    options: [
      { id: calm, label: "Calm" },
      { id: loud, label: "Loud" },
    ],
  };
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await defined(page, [mood]);
  await added(page, [bleach]);
  await applied(page, bleach.id, mood.id, calm);

  await page.goto("/settings/custom-fields");
  await live(page);
  await row(page, "Mood").focus();
  await page.keyboard.press("Enter");
  const options = settings(page).getByRole("group", { name: "Options" });

  // Added at the end, with a label in use refused.
  const fresh = options.getByRole("textbox", { name: "New option" });
  await fresh.fill("calm");
  await fresh.press("Enter");
  await expect(options).toContainText("'Calm' already exists. Choose another label.");
  await fresh.fill("Odd");
  await fresh.press("Enter");
  await expect(options.getByRole("textbox", { name: "Option 'Odd'" })).toBeVisible();

  // Renamed in place.
  const loudLabel = options.getByRole("textbox", { name: "Option 'Loud'" });
  await loudLabel.fill("Noisy");
  await loudLabel.press("Enter");
  await expect(options.getByRole("textbox", { name: "Option 'Noisy'" })).toHaveValue("Noisy");
  await saved(page);

  // No album chooses "Noisy": it goes at once.
  await options.getByRole("button", { name: "Remove Noisy" }).press("Enter");
  await expect(options.getByRole("textbox", { name: "Option 'Noisy'" })).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  // "Calm" is chosen: it asks, and Cancel changes nothing.
  await options.getByRole("button", { name: "Remove Calm" }).press("Enter");
  const confirm = page.getByRole("alertdialog", { name: "Remove option 'Calm'?" });
  await expect(confirm).toContainText("Chosen on 1 album in 'Mood'");
  await expect(confirm).toContainText("Those albums keep the field, empty.");
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(options.getByRole("textbox", { name: "Option 'Calm'" })).toBeVisible();

  await options.getByRole("button", { name: "Remove Calm" }).press("Enter");
  await confirm.getByRole("button", { name: "Remove from 1 album" }).press("Enter");
  await expect(options.getByRole("textbox", { name: "Option 'Calm'" })).toHaveCount(0);
  await saved(page);
  await page.reload();
  await live(page);
  await expect(settings(page).getByRole("row", { name: /Mood/ })).toContainText("1 option");
});
