// Folder and list descriptions in a real browser (AC-03; FR-03.5, DS-41, DS-45): written in Editing mode under the
// header, shown in Viewing mode and in the folder's rows, kept through a reload and a move, and cleared by emptying
// the text box.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7 } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { insert, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const mode = (page: Page, name: "View" | "Edit") =>
  page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name });

test("a description is written, shown in the header and rows, kept through a move, and cleared", async ({
  page,
}) => {
  await signIn(page, accounts.descriptions);
  await live(page);
  const rock = {
    id: uuidv7(),
    kind: "folder" as const,
    parentId: null,
    name: "Rock",
    description: null,
  };
  const grunge = {
    id: uuidv7(),
    kind: "list" as const,
    parentId: rock.id,
    name: "Grunge",
    description: null,
  };
  const other = {
    id: uuidv7(),
    kind: "folder" as const,
    parentId: null,
    name: "Other",
    description: null,
  };
  await insert(page, rock, other, grunge);
  await saved(page);

  await page.goto(`/l/${grunge.id}`);
  await live(page);
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();
  const box = page.getByRole("textbox", { name: "Description" });
  await expect(box).toHaveAttribute("placeholder", "Add a description");
  await box.fill("Seattle, 1988 to 1994");
  await box.press("Shift+Enter");
  await box.pressSequentially("Loud and sludgy.");
  await box.press("Enter");
  await saved(page);
  expect(await violations(page, "main")).toEqual([]);

  // Viewing mode shows it, line breaks kept.
  await mode(page, "View").click();
  const main = page.getByRole("main");
  await expect(main.getByText("Seattle, 1988 to 1994")).toBeVisible();
  await expect(main).toContainText("Loud and sludgy.");

  // The folder's row shows its first line, after the name.
  await page.goto(`/f/${rock.id}`);
  await live(page);
  const row = page
    .getByRole("grid", { name: "Rock" })
    .getByRole("row")
    .filter({ hasText: "Grunge" });
  await expect(row).toContainText("Seattle, 1988 to 1994");
  await expect(row).not.toContainText("Loud and sludgy.");
  await expect(row.getByRole("link", { name: "Grunge" })).toHaveAccessibleDescription(
    "Seattle, 1988 to 1994",
  );

  // Moved to another folder, and reloaded, it keeps it.
  await page.evaluate(
    async ({ id, parentId }) => {
      await window.tonarisSync?.containers.update(id, (draft) => {
        draft.parentId = parentId;
      }).isPersisted.promise;
    },
    { id: grunge.id, parentId: other.id },
  );
  await page.goto(`/l/${grunge.id}`);
  await live(page);
  await expect(page.getByRole("main")).toContainText("Seattle, 1988 to 1994");

  // Emptied, it is cleared.
  await page.keyboard.press("e");
  await page.getByRole("textbox", { name: "Description" }).fill("");
  await page.getByRole("textbox", { name: "Description" }).press("Enter");
  await saved(page);
  await page.keyboard.press("e");
  await expect(page.getByRole("main")).not.toContainText("Seattle");
});
