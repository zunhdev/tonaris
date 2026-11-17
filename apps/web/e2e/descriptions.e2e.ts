// Folder and list descriptions in a real browser (AC-03; FR-03.5, DS-41, DS-45; TON-292): written in Editing mode in
// the description panel, with Markdown's marks, shown rendered under the header in three lines and More, its first
// line in the folder's rows, kept through a reload and a move, refused over 2,000 characters, and cleared by emptying
// the text box.

import { uuidv7 } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Page } from "./support/test";
import { insert, live, saved, violations, foldersAsRows } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const mode = (page: Page, name: "View" | "Edit") =>
  page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name });
const panel = (page: Page) => page.getByRole("complementary", { name: "Description" });

test("a description is written, shown in the header and rows, kept through a move, and cleared", async ({
  page,
}) => {
  await signIn(page, accounts.descriptions);
  await live(page);
  // Folders as rows, which this test is about; cards are their default (TON-174).
  await foldersAsRows(page);
  const rock = {
    id: uuidv7(),
    kind: "folder" as const,
    parentId: null,
    name: "Rock",
    description: null,
    color: null,
  };
  const grunge = {
    id: uuidv7(),
    kind: "list" as const,
    parentId: rock.id,
    name: "Grunge",
    description: null,
    color: null,
  };
  const other = {
    id: uuidv7(),
    kind: "folder" as const,
    parentId: null,
    name: "Other",
    description: null,
    color: null,
  };
  await insert(page, rock, other, grunge);
  await saved(page);

  await page.goto(`/l/${grunge.id}`);
  await live(page);
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();
  const main = page.getByRole("main");
  // Nothing shows under the header yet; Description in it opens the panel, its text box focused.
  await main.getByRole("button", { name: "Description", exact: true }).click();
  const box = panel(page).getByRole("textbox", { name: "Description" });
  await expect(box).toBeFocused();
  await expect(box).toHaveAttribute("placeholder", "Add a description");
  await box.fill("Seattle, 1988 to 1994");
  // ⌘B makes the selection bold; Enter adds a line.
  await box.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 7));
  await box.press("ControlOrMeta+B");
  await expect(box).toHaveValue("**Seattle**, 1988 to 1994");
  await box.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(99, 99));
  await box.pressSequentially("\nLoud and *sludgy*.\n\n- Nirvana\n- Mudhoney\n\nMore on ");
  await box.pressSequentially("[Wikipedia](https://en.wikipedia.org/wiki/Grunge).");
  // The description under the header follows the typing.
  await expect(main.locator("strong", { hasText: "Seattle" })).toBeVisible();
  expect(await violations(page, 'aside[aria-label="Description"]')).toEqual([]);
  await panel(page).getByRole("button", { name: "Done" }).click();
  await expect(panel(page)).toHaveCount(0);
  await saved(page);
  expect(await violations(page, "main")).toEqual([]);

  // Viewing mode shows it rendered: three lines, then More shows the rest.
  await mode(page, "View").click();
  await expect(main.locator("strong", { hasText: "Seattle" })).toBeVisible();
  await expect(main.locator("em", { hasText: "sludgy" })).toBeVisible();
  const more = main.getByRole("button", { name: "More" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(main.getByRole("button", { name: "Less" })).toHaveAttribute("aria-expanded", "true");
  await expect(main.getByRole("listitem").filter({ hasText: "Mudhoney" })).toBeVisible();
  const wikipedia = main.getByRole("link", { name: "Wikipedia" });
  await expect(wikipedia).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Grunge");
  await expect(wikipedia).toHaveAttribute("target", "_blank");

  // The folder's row shows its first line, after the name.
  await page.goto(`/f/${rock.id}`);
  await live(page);
  const row = page
    .getByRole("grid", { name: "Rock" })
    .getByRole("row")
    .filter({ hasText: "Grunge" });
  await expect(row).toContainText("Seattle, 1988 to 1994");
  await expect(row).not.toContainText("**");
  await expect(row).not.toContainText("Loud and sludgy.");
  await expect(row.getByRole("link", { name: "Grunge" })).toHaveAccessibleDescription(
    "Seattle, 1988 to 1994",
  );

  // Moved to another folder, and reloaded, it keeps it.
  await page.evaluate(
    async ({ id, parentId }) => {
      await window.tonarisSync?.containers
        .update(id, (draft) => {
          draft.parentId = parentId;
        })
        .when("settled");
    },
    { id: grunge.id, parentId: other.id },
  );
  await page.goto(`/l/${grunge.id}`);
  await live(page);
  await expect(page.getByRole("main")).toContainText("Seattle, 1988 to 1994");

  // In Editing mode a click on it opens the panel too. Over 2,000 characters the panel stays, with the reason.
  await page.keyboard.press("e");
  await main.getByText("Seattle, 1988 to 1994").click();
  await expect(box).toBeFocused();
  await box.fill("a".repeat(2_001));
  await box.press("Escape");
  await expect(panel(page)).toContainText("Descriptions can be at most 2,000 characters.");
  await expect(panel(page)).toContainText("2,001 / 2,000");

  // Emptied, it is cleared; Esc closes the panel and saves.
  await box.fill("");
  await box.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await saved(page);
  await page.keyboard.press("e");
  await expect(main).not.toContainText("Seattle");
});
