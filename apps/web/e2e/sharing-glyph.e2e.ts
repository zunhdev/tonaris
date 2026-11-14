// The glyph on the person's shared folders and lists in a real browser (DS-27, DS-31, DS-41; TON-227): a link turned
// on in the sharing dialog shows on the folder in the tree and in views, dimmer on what it holds, and stays after a
// reload; what isn't shared has none. Deleting the shared folder names what its sharing loses (TON-226).

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Page } from "./support/test";
import { insert, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (kind: Container["kind"], name: string, parentId: string | null = null) => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
  color: null,
});
const treeItem = (page: Page, name: string) =>
  page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}`) });
const glyph = (page: Page, name: string) =>
  treeItem(page, name).locator('[data-slot="sharing-glyph"]');

test("a shared folder carries a glyph, and what it holds a dimmer one", async ({ page }) => {
  await signIn(page, accounts.sharingGlyph);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  const stoner = container("list", "Stoner");
  await insert(page, metal, doom, stoner);
  await saved(page);
  await page.goto(`/f/${metal.id}`);
  await live(page);
  await expect(page.locator('[data-slot="sharing-glyph"]')).toHaveCount(0);

  // The link on, from the sharing dialog.
  await page.getByRole("button", { name: "Share" }).click();
  const share = page.getByRole("dialog", { name: `Share "Metal" · folder` });
  await share.getByRole("textbox", { name: "Add a display name to share" }).fill("Denis");
  await share.getByRole("button", { name: "Save" }).click();
  await share.getByRole("switch", { name: "Link sharing" }).click();
  await expect(share.getByRole("textbox", { name: "Share link" })).toHaveValue(/\/s\//);
  await page.keyboard.press("Escape");
  await expect(share).toHaveCount(0);

  await expect(glyph(page, "Metal")).toHaveAttribute("title", "Shared by link");
  await expect(treeItem(page, "Metal")).toHaveAccessibleName(/^Metal ?, shared by link/);
  // Opened, the folder shows the list inside.
  await treeItem(page, "Metal").focus();
  await page.keyboard.press("ArrowRight");
  await expect(treeItem(page, "Metal")).toHaveAttribute("aria-expanded", "true");
  await expect(glyph(page, "Doom")).toHaveAttribute(
    "title",
    "Shared by link through a folder above",
  );
  await expect(glyph(page, "Doom")).toHaveAttribute("data-inherited", "true");
  await expect(glyph(page, "Stoner")).toHaveCount(0);
  // The folder's view shows it on the list inside too.
  await expect(
    page.getByRole("main").locator('[data-slot="sharing-glyph"]').first(),
  ).toHaveAttribute("title", "Shared by link through a folder above");
  expect(await violations(page, '[role="tree"]')).toEqual([]);

  await page.reload();
  await live(page);
  await expect(glyph(page, "Metal")).toHaveAttribute("title", "Shared by link");

  // Deleting the folder says its link stops working while it's in Trash (DS-50, TON-226); Cancel keeps it.
  await treeItem(page, "Metal").focus();
  await page.keyboard.press("Backspace");
  const confirm = page.getByRole("alertdialog", { name: "Delete folder 'Metal'?" });
  await expect(confirm).toContainText(
    "While it's in Trash, anyone with a link to it can't open it or anything inside; recovering it gives them access again.",
  );
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
});
