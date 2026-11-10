// Editing a share in a real browser (DS-70 for editors; FR-07.18, FR-07.19; TON-191): an owner and an editor build a
// list together, each seeing the other's changes without reloading, and an editor who loses access is told so.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description: null, color: null });

/** Sends a mutation as the page's account, as the app does. */
async function send(page: Page, name: string, args: Record<string, unknown>) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name, args },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).outcome.status).toBe("confirmed");
}

async function signedIn(browser: Browser, address: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, address);
  await live(page);
  return page;
}

/** The owner's "Metal" holding "Doom" with "Nightfall", shared with `editor` to edit, who accepted. */
async function sharedToEdit(owner: Page, browser: Browser, ownerEmail: string, editor: string) {
  await signIn(owner, ownerEmail);
  await live(owner);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  await insert(owner, metal, doom);
  await saved(owner);
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(owner, [nightfall], doom.id);
  await send(owner, "account.setDisplayName", { displayName: "Denis" });
  const grantId = uuidv7();
  await send(owner, "share.invite", {
    grantId,
    containerId: metal.id,
    email: editor,
    role: "edit",
  });
  const page = await signedIn(browser, editor);
  await send(page, "share.accept", { grantId });
  return { page, metal, doom, nightfall, grantId };
}

test("an owner and an editor build a list together, each seeing the other's changes", async ({
  page: owner,
  browser,
}) => {
  const {
    page: editor,
    metal,
    doom,
    nightfall,
  } = await sharedToEdit(owner, browser, accounts.editOwner, accounts.shareEditor);

  // The editor opens the shared list: the owner's content, with who it's from.
  await editor.goto(`/shared/${metal.id}?c=${doom.id}`);
  await expect(editor.getByRole("heading", { name: "Doom", level: 1 })).toBeVisible();
  await expect(editor.getByText("Can edit · Shared by Denis")).toBeVisible();
  await expect(editor.getByText("Nightfall")).toBeVisible();

  // The owner has the same list open.
  await owner.goto(`/l/${doom.id}`);
  await live(owner);

  // The editor renames it; the owner sees the new name without reloading.
  await editor.keyboard.press("e");
  await editor.getByRole("button", { name: "Rename" }).click();
  const rename = editor.getByRole("dialog", { name: `Rename "Doom"` });
  await rename.getByRole("textbox", { name: "Name" }).fill("Doom Metal");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(rename).toHaveCount(0);
  await expect(editor.getByRole("heading", { name: "Doom Metal", level: 1 })).toBeVisible();
  await expect(owner.getByRole("heading", { name: "Doom Metal", level: 1 })).toBeVisible();

  // The owner adds an album; the editor sees it without reloading.
  await added(owner, [album("Epicus Doomicus", { originalYear: 1986 })], doom.id);
  await expect(editor.getByText("Epicus Doomicus")).toBeVisible();

  // The editor takes Nightfall out of the list, from its panel; the owner sees it go.
  await editor.goto(`/shared/${metal.id}?c=${doom.id}&album=${nightfall.id}`);
  await editor
    .getByRole("complementary")
    .getByRole("button", { name: "Remove from Doom Metal" })
    .click();
  await expect(owner.getByText("Nightfall")).toHaveCount(0);

  // The editor makes a list in the shared folder; the owner's sidebar shows it, in their own collection.
  await editor.goto(`/shared/${metal.id}`);
  await expect(editor.getByRole("heading", { name: "Metal", level: 1 })).toBeVisible();
  await editor.getByRole("main").getByRole("button", { name: "New list" }).click();
  const naming = editor.getByRole("dialog", { name: `New list in "Metal"` });
  await naming.getByRole("textbox", { name: "Name" }).fill("Sludge");
  await naming.getByRole("button", { name: "Create" }).click();
  await expect(naming).toHaveCount(0);
  await expect(owner.getByRole("tree").getByRole("treeitem", { name: /^Sludge/ })).toHaveCount(1, {
    timeout: 10_000,
  });
  // The editor's own collection doesn't have it: their sidebar shows only theirs.
  await expect(editor.getByRole("tree").getByRole("treeitem", { name: /^Sludge/ })).toHaveCount(0);
});

test("an editor whose access ends while editing is told it's no longer available", async ({
  page: owner,
  browser,
}) => {
  const {
    page: editor,
    metal,
    doom,
    grantId,
  } = await sharedToEdit(owner, browser, accounts.revokeOwner, accounts.revokedEditor);
  await editor.goto(`/shared/${metal.id}?c=${doom.id}`);
  await expect(editor.getByText("Can edit · Shared by Denis")).toBeVisible();

  await send(owner, "share.revoke", { grantId });
  await expect(editor.getByRole("main").getByText(/No longer available/)).toBeVisible({
    timeout: 10_000,
  });
});
