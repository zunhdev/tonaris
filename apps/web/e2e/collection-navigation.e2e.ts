// The sidebar tree, the collection routes and the shortcuts in a real browser (FR-01.1, FR-01.3; DS-27, DS-30–DS-32,
// DS-78): folders and lists created, renamed and walked by keyboard alone, views that say where they are, and what
// the device remembers. Each test signs in with its own account.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Album } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  created,
  indicator,
  insert,
  list,
  live,
  savedNames,
  toasts,
  violations,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const tree = (page: Page) => page.getByRole("tree", { name: "Collection" });
const item = (page: Page, name: string | RegExp) => tree(page).getByRole("treeitem", { name });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });
const heading = (page: Page) => page.getByRole("heading", { level: 1 });

/** Where the folder or list `name` lives, as the API has it. */
async function idOf(page: Page, name: string): Promise<string> {
  const id = await page.evaluate(
    (wanted) =>
      [...(window.tonarisSync?.containers.values() ?? [])].find((each) => each.name === wanted)?.id,
    name,
  );
  if (!id) throw new Error(`No folder or list named ${name}.`);
  return id;
}

const album = (title: string): Album => ({
  id: uuidv7(),
  title,
  artistCredit: "Candlemass",
  releaseType: "album",
  isLive: false,
  originalYear: 1986,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
});

test("folders and lists are created, renamed and walked by keyboard alone", async ({ page }) => {
  await signIn(page, accounts.navKeyboard);
  await live(page);

  // ⇧N makes a folder at the top level, then N with it focused makes a list inside it.
  await page.keyboard.press("Shift+N");
  await expect(page.getByRole("textbox", { name: "Name of the new folder" })).toBeFocused();
  await page.keyboard.type("Metal");
  await page.keyboard.press("Enter");
  const metal = item(page, "Metal");
  await expect(metal).toBeFocused();
  await page.keyboard.press("n");
  await expect(page.getByRole("textbox", { name: "Name of the new list" })).toBeFocused();
  await page.keyboard.type("Doom");
  await page.keyboard.press("Enter");
  await expect(item(page, "Doom 0 albums")).toBeFocused();
  await expect(item(page, "Doom 0 albums")).toHaveAttribute("aria-level", "2");
  await expect.poll(() => savedNames(page)).toEqual(["Doom", "Metal"]);

  // F2 renames it.
  await page.keyboard.press("F2");
  const field = page.getByRole("textbox", { name: "New name for 'Doom'" });
  await expect(field).toHaveValue("Doom");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Funeral doom");
  await page.keyboard.press("Enter");
  const doom = item(page, "Funeral doom 0 albums");
  await expect(doom).toBeFocused();
  await expect.poll(() => savedNames(page)).toEqual(["Funeral doom", "Metal"]);

  // ← to the folder and to collapse it, → to expand it and into it, Enter to open.
  await page.keyboard.press("ArrowLeft");
  await expect(metal).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(metal).toHaveAttribute("aria-expanded", "false");
  await expect(doom).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(metal).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(doom).toBeFocused();
  await page.keyboard.press("Enter");
  const doomId = await idOf(page, "Funeral doom");
  await expect(page).toHaveURL(`/l/${doomId}`);
  await expect(heading(page)).toHaveText("Funeral doom");
  await expect(page).toHaveTitle("Funeral doom · Tonaris");
  const crumbs = page.getByRole("navigation", { name: "Breadcrumbs" }).getByRole("link");
  await expect(crumbs).toHaveText(["Collection", "Metal"]);
  // The name is the breadcrumbs' size, set apart by weight (TON-107).
  await expect(heading(page)).toHaveCSS("font-size", "13px");
  await expect(heading(page)).toHaveCSS("font-weight", "500");
  await expect(crumbs.first()).toHaveCSS("font-size", "13px");
  await expect(doom).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No albums yet.", { exact: false })).toBeVisible();

  // Letters that aren't shortcuts type ahead; End and Home jump.
  await page.keyboard.press("u");
  await expect(item(page, "Unsorted 0 albums")).toBeFocused();
  await page.keyboard.press("End");
  await expect(item(page, "Trash")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(metal).toBeFocused();
  await page.keyboard.press("f");
  await expect(doom).toBeFocused();

  // G then U, G then H.
  await page.keyboard.press("g");
  await page.keyboard.press("u");
  await expect(page).toHaveURL("/unsorted");
  await expect(heading(page)).toHaveText("Unsorted");
  await page.keyboard.press("g");
  await page.keyboard.press("h");
  await expect(page).toHaveURL("/c");
  await expect(page.getByRole("grid", { name: "Collection" }).getByRole("link")).toHaveText([
    "Metal",
  ]);

  // `[` hides and shows the sidebar; `?` opens the reference.
  await page.keyboard.press("[");
  await expect(sidebar(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Show sidebar" })).toBeVisible();
  await page.keyboard.press("[");
  await expect(sidebar(page)).toBeVisible();
  await page.keyboard.press("?");
  const reference = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(reference).toBeVisible();
  await expect(reference.getByText("Go to Unsorted")).toBeVisible();
  expect(await violations(page, '[data-slot="dialog-content"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(reference).toBeHidden();
  expect((await new AxeBuilder({ page }).include("nav").analyze()).violations).toEqual([]);
});

test("the tree and the sidebar's width are remembered on the device, and / returns to the last view", async ({
  page,
}) => {
  await signIn(page, accounts.navRoutes);
  await live(page);
  const metal = { ...list("Metal"), kind: "folder" as const };
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).isPersisted.promise;
    },
    [metal, { ...list("Doom"), parentId: metal.id }],
  );
  const doomId = await idOf(page, "Doom");

  // Albums added elsewhere in the client show in the counts, live.
  const albums = [album("Epicus Doomicus Metallicus"), album("Nightfall"), album("Ancient Dreams")];
  await page.evaluate(
    async ({ list: listId, owned }) => {
      await window.tonarisSync?.albums.insert(owned).isPersisted.promise;
      await window.tonarisSync?.memberships.insert(
        owned
          .slice(0, 2)
          .map((each) => ({ listId, albumId: each.id, addedAt: new Date().toISOString() })),
      ).isPersisted.promise;
    },
    { list: doomId, owned: albums },
  );
  await expect(item(page, "Unsorted 1 album")).toBeVisible();

  // Opening the list expands its folder, which stays expanded after a reload.
  await page.goto(`/l/${doomId}`);
  await live(page);
  await expect(item(page, "Doom 2 albums")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("grid", { name: "Doom" })).toHaveAttribute("aria-rowcount", "3");

  // A folder's path given a list leads to the list's; a missing one says so.
  await page.goto(`/f/${doomId}`);
  await expect(page).toHaveURL(`/l/${doomId}`);
  await page.goto(`/f/${uuidv7()}`);
  await expect(page.getByText("This folder or list isn't available.")).toBeVisible();
  await page.getByRole("link", { name: "Go to your collection" }).click();
  await expect(page).toHaveURL("/c");

  // The sidebar's edge resizes it by keyboard, kept after a reload.
  await page.goto(`/l/${doomId}`);
  await live(page);
  const edge = page.getByRole("separator", { name: "Resize sidebar" });
  await edge.focus();
  await page.keyboard.press("ArrowRight");
  await expect(edge).toHaveAttribute("aria-valuenow", "256");
  await page.keyboard.press("End");
  await expect(edge).toHaveAttribute("aria-valuenow", "360");

  // `/` returns to the list, with the folder still expanded and the width kept.
  await page.goto("/");
  await expect(page).toHaveURL(`/l/${doomId}`);
  await live(page);
  await expect(item(page, "Metal")).toHaveAttribute("aria-expanded", "true");
  expect((await sidebar(page).boundingBox())?.width).toBe(360);
});

test("closing a folder that holds the open list selects the folder, and it stays closed", async ({
  page,
}) => {
  await signIn(page, accounts.closeHolder);
  await live(page);
  // The list 'Doom' in the folder 'Thrash' in the folder 'Metal'.
  const metal = { ...list("Metal"), kind: "folder" as const };
  const thrash = { ...list("Thrash"), kind: "folder" as const, parentId: metal.id };
  const doom = { ...list("Doom"), parentId: thrash.id };
  await insert(page, metal, thrash, doom);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await expect(item(page, /^Doom\b/)).toHaveAttribute("aria-selected", "true");

  // The chevron closes 'Thrash', which then is the view, selected.
  const thrashItem = item(page, /^Thrash\b/);
  await thrashItem.locator('[data-slot="row-chevron"]').click();
  await expect(thrashItem).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(`/f/${thrash.id}`);
  await expect(thrashItem).toHaveAttribute("aria-selected", "true");
  await expect(item(page, /^Doom\b/)).toBeHidden();

  // Back to the list, its folders open again; ← on 'Metal' closes it and selects it, and it stays closed.
  await page.goBack();
  await expect(item(page, /^Doom\b/)).toHaveAttribute("aria-selected", "true");
  const metalItem = item(page, /^Metal\b/);
  await metalItem.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(`/f/${metal.id}`);
  await expect(metalItem).toHaveAttribute("aria-expanded", "false");
  await expect(metalItem).toHaveAttribute("aria-selected", "true");
  await expect(metalItem).toBeFocused();
  await expect(thrashItem).toBeHidden();
});

test("names are checked before sending, and a name the server refuses can be edited", async ({
  page,
}) => {
  await signIn(page, accounts.navNames);
  await live(page);
  await created(page, "Later");

  // A taken name keeps the editor open with the reason, and nothing is sent.
  await page.getByRole("button", { name: "New list or folder" }).click();
  await page.getByRole("menuitem", { name: "New list" }).click();
  const field = page.getByRole("textbox", { name: "Name of the new list" });
  await expect(field).toBeFocused();
  // Shortcuts wait while typing: "gu" is only text.
  await page.keyboard.type("gu");
  await expect(page).toHaveURL("/c");
  await field.fill("later");
  await page.keyboard.press("Enter");
  await expect(field).toHaveAccessibleDescription(
    "'Later' already exists at the top level. Choose another name.",
  );
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(field).toBeHidden();
  expect(await savedNames(page)).toEqual(["Later"]);

  // A list the server refuses (made through the client, as a race with another session would) offers Edit.
  await insert(page, list("Later"));
  const toast = toasts(page).filter({ hasText: "Couldn't save the list 'Later'" });
  await expect(toast).toBeVisible();
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "Edit" }).click();
  const again = page.getByRole("textbox", { name: "Name of the new list" });
  await expect(again).toHaveValue("Later");
  await again.fill("Sooner");
  await page.keyboard.press("Enter");
  await expect.poll(() => savedNames(page)).toEqual(["Later", "Sooner"]);
  await expect(toast).toBeHidden();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
});

test("offline, folders and lists can't be created or renamed", async ({ page, context }) => {
  await signIn(page, accounts.navOffline);
  await live(page);
  await created(page, "Later");

  await context.setOffline(true);
  await expect(indicator(page)).toHaveAccessibleName(
    "Sync status: Offline — changes can't be saved",
  );
  const plus = page.getByRole("button", { name: "New list or folder" });
  await expect(plus).toHaveAttribute("aria-disabled", "true");
  await plus.hover();
  await expect(page.getByText("You're offline", { exact: true })).toBeVisible();
  await page.keyboard.press("n");
  await item(page, "Later 0 albums").focus();
  await page.keyboard.press("F2");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await context.setOffline(false);
});
