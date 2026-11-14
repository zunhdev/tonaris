// "Find a folder" in Move to… (DS-49, TON-183): Collection first, 8 folders by path and how many more, a folder found by
// the words of its path and moved into with Enter, then remembered under "Recent" for the next move; no matches; and a
// field that stays put while finding. Its sharing preview is in sharing-impact.e2e.ts, the restore prompt's finder in
// recovery.e2e.ts.

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Page } from "./support/test";
import { announcements, insert, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description: null, color: null });
const item = (page: Page, name: string) =>
  page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}`) });

test("Move to… finds folders by typing, and suggests the ones moved into lately", async ({
  page,
}) => {
  await signIn(page, accounts.folderFinder);
  await live(page);
  const metal = container("folder", "Metal");
  const rock = container("folder", "Русский рок");
  await insert(
    page,
    metal,
    container("folder", "Jazz"),
    rock,
    ...["Avant", "Black", "Blackgaze", "Death", "Death-Doom", "Djent", "Doom"].map((name) =>
      container("folder", name, metal.id),
    ),
    container("list", "Перемотка", rock.id),
    container("list", "Spare"),
  );
  await saved(page);
  await item(page, "Русский рок").focus();
  await page.keyboard.press("ArrowRight");

  // Before typing: Collection, then 8 folders by path, and how many more.
  await item(page, "Перемотка").focus();
  await page.keyboard.press("m");
  const picker = page.getByRole("dialog", { name: "Move 'Перемотка' to…" });
  const field = picker.getByRole("combobox", { name: "Find a folder" });
  await expect(field).toBeFocused();
  await expect(picker.getByRole("option")).toHaveText([
    "Collection",
    "Jazz",
    "Metal",
    "Metal › Avant",
    "Metal › Black",
    "Metal › Blackgaze",
    "Metal › Death",
    "Metal › Death-Doom",
    "Metal › Djent",
  ]);
  await expect(picker.getByRole("group", { name: "Folders" })).toBeVisible();
  await expect(picker).toContainText("Type to find the other 1 folder.");
  expect(await violations(page, '[role="dialog"]')).toEqual([]);

  // Typing finds by the path's words, the name's match first, marked; Enter moves.
  await picker.evaluate((node) =>
    Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  const top = (await field.boundingBox())?.y;
  await field.fill("doom");
  const found = picker.getByRole("option");
  await expect(found).toHaveCount(2);
  await expect(found.first()).toHaveText("Metal › Doom");
  await expect(found.first().locator("mark")).toHaveText("Doom");
  // The dialog keeps its top while the list shortens.
  expect((await field.boundingBox())?.y).toBe(top);
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(announcements(page).first()).toHaveText("Moved Перемотка to Doom");

  // The next move suggests Doom under Recent; the rest by path.
  await item(page, "Spare").focus();
  await page.keyboard.press("m");
  const next = page.getByRole("dialog", { name: "Move 'Spare' to…" });
  await expect(next.getByRole("group", { name: "Recent" }).getByRole("option")).toHaveText([
    "Metal › Doom",
  ]);
  await expect(next.getByRole("group", { name: "Other folders" }).getByRole("option")).toHaveCount(
    7,
  );
  await expect(next).toContainText("Type to find the other 2 folders.");

  // No matches: a note, and Enter does nothing.
  await next.getByRole("combobox", { name: "Find a folder" }).fill("zzz");
  await expect(next).toContainText("No folders match 'zzz'.");
  await page.keyboard.press("Enter");
  await expect(next).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(next).toHaveCount(0);
  await expect(item(page, "Spare")).toHaveAttribute("aria-level", "1");
});
