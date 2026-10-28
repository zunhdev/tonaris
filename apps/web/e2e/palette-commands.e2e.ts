// The palette's commands in a real browser (DS-75, DS-78; FR-12.2, Q-02): `>` lists only commands; a command acts on
// what had the focus when the palette opened, as its key would; one that can't run says why; every command is in the
// reference with the same keys; an empty palette shows what was opened lately and the commands run most. Each test
// has its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { commands } from "../src/features/shell/shortcuts";
import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (kind: Container["kind"], name: string): Container => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
  description: null,
});
const palette = (page: Page) => page.getByRole("dialog", { name: "Search" });
const field = (page: Page) => page.getByRole("combobox", { name: "Search" });
const group = (page: Page, name: string) => palette(page).getByRole("group", { name, exact: true });
const item = (page: Page, name: string) =>
  page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}`) });

test("commands: > lists only them, they act on the focus or say why not, and match the reference", async ({
  page,
}) => {
  await signIn(page, accounts.paletteCommands);
  await live(page);
  const doom = container("list", "Doom");
  await insert(page, doom);
  await saved(page);

  // `>` lists commands only, with their keys.
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("> new");
  await expect(palette(page).getByRole("group")).toHaveCount(1);
  const found = group(page, "Commands").getByRole("option");
  await expect(found.filter({ hasText: "New list" })).toContainText("shortcut N");
  await expect(found.filter({ hasText: "New folder" })).toContainText("shortcut ⇧ N");
  // Typed text without `>` finds content and commands alike.
  await field(page).fill("doom");
  await expect(group(page, "Lists").getByRole("option")).toContainText("Doom");
  await expect(group(page, "Commands")).toHaveCount(0);

  // With nothing open or focused, Open in… says why it can't run, and choosing it does nothing.
  await field(page).fill(">open in");
  const openIn = group(page, "Commands").getByRole("option", { name: /Open in/ });
  await expect(openIn).toHaveAttribute("aria-disabled", "true");
  await expect(openIn).toContainText("Open or focus an album first");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeVisible();
  expect(await violations(page, '[data-slot="command-content"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(palette(page)).toHaveCount(0);

  // A command acts on what had the focus when the palette opened.
  await item(page, "Doom").focus();
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill("move");
  await group(page, "Commands")
    .getByRole("option", { name: /Move to/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Move 'Doom' to…" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Every command is in the reference with the same keys.
  await page.keyboard.press("?");
  const reference = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(reference).toBeVisible();
  await Promise.all(
    commands.map(({ title, keys }) =>
      expect(
        reference
          .locator("dl > div")
          .filter({ has: page.getByText(title, { exact: true }) })
          .locator("dd"),
      ).toHaveText(keys.join("")),
    ),
  );
  await expect(reference.getByText("Restore", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reference).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+k");
  await field(page).fill(">");
  const all = group(page, "Commands").getByRole("option");
  await expect(all).toHaveCount(commands.length);
  await Promise.all(
    commands.map(({ keys }) =>
      expect(all.filter({ hasText: `shortcut ${keys.join(" ")}` })).toHaveCount(1),
    ),
  );
});

test("an empty palette shows what was opened lately and the commands run most", async ({
  page,
}) => {
  await signIn(page, accounts.paletteRecent);
  await live(page);
  const doom = container("list", "Doom");
  await insert(page, doom);
  await saved(page);
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await added(page, [bleach], doom.id);

  // The list, then its album in the inspector.
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await page.goto(`/l/${doom.id}?album=${bleach.id}`);
  await live(page);
  await page.keyboard.press("ControlOrMeta+k");
  const recent = group(page, "Recent").getByRole("option");
  await expect(recent.nth(0)).toContainText("Bleach");
  await expect(recent.nth(1)).toContainText("Doom");
  // Before any history, the starter set.
  const frequent = group(page, "Frequent commands").getByRole("option");
  await expect(frequent).toHaveCount(5);
  await expect(frequent.nth(0)).toContainText("Add albums from links");

  // Run twice from the palette, Go to Trash leads.
  const goToTrash = async () => {
    await field(page).fill("go to trash");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/trash");
    await expect(palette(page)).toHaveCount(0);
  };
  await goToTrash();
  await page.goto("/c");
  await live(page);
  await page.keyboard.press("ControlOrMeta+k");
  await goToTrash();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(frequent.nth(0)).toContainText("Go to Trash");
});
