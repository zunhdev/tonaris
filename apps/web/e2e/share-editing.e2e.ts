// Editing a share in a real browser (DS-70 for editors; FR-07.18, FR-07.19; TON-191): an owner and an editor build a
// list together, each seeing the other's changes without reloading, and an editor who loses access is told so.

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Browser, type Page } from "./support/test";
import { added, album, insert, live, saved, savedNames, webOrigin } from "./support/workspace";

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

test("an editor's unsent rename is counted at sign-out, sent after a reload, and leaves nothing behind (TON-212)", async ({
  page: owner,
  browser,
}) => {
  const {
    page: editor,
    metal,
    doom,
  } = await sharedToEdit(owner, browser, accounts.unsentOwner, accounts.unsentEditor);
  await editor.goto(`/shared/${metal.id}?c=${doom.id}`);
  await expect(editor.getByText("Can edit · Shared by Denis")).toBeVisible();

  // The rename's first send never gets an answer, and dies with the page; later sends go through.
  let held = false;
  await editor.route(`${apiUrl}/v1/mutations`, async (route) => {
    if (held) return route.continue();
    held = true;
    return undefined;
  });
  await editor.keyboard.press("e");
  await editor.getByRole("button", { name: "Rename" }).click();
  const rename = editor.getByRole("dialog", { name: `Rename "Doom"` });
  await rename.getByRole("textbox", { name: "Name" }).fill("Doom Metal");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(rename).toHaveCount(0);
  await expect.poll(() => held).toBe(true);

  // Signing out would discard it, and says so.
  const account = editor.getByRole("button", { name: `Account: ${accounts.unsentEditor}` });
  const discard = editor.getByRole("alertdialog", { name: "Sign out with unsaved changes?" });
  await account.click();
  await editor.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(discard).toContainText("1 change hasn't been saved yet.");
  await discard.getByRole("button", { name: "Cancel" }).click();
  await expect(discard).toHaveCount(0);

  // After a reload, the new page sends what the old one left: the owner gets the name.
  await editor.reload();
  await expect
    .poll(async () => (await savedNames(owner)).includes("Doom Metal"), { timeout: 25_000 })
    .toBe(true);

  // Signing out deletes the share's database with the account's own.
  await account.click();
  await editor.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(editor).toHaveURL(/\/sign-in/);
  const databases = await editor.evaluate(async () =>
    (await indexedDB.databases()).flatMap((each) => (each.name ? [each.name] : [])),
  );
  expect(databases.filter((name) => name.startsWith("tonaris-sync:"))).toEqual([]);
});

test("inside a share, pasted links go in its list on view, Share is the owner's, and Delete waits offline (TON-213)", async ({
  page: owner,
  browser,
}) => {
  const {
    page: editor,
    metal,
    doom,
  } = await sharedToEdit(owner, browser, accounts.pasteOwner, accounts.pasteEditor);
  await editor.goto(`/shared/${metal.id}?c=${doom.id}`);
  await expect(editor.getByText("Can edit · Shared by Denis")).toBeVisible();

  // ⌘V on the shared list: the album joins it, in the owner's collection, not the editor's Unsorted.
  await editor.evaluate((pasted) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", pasted);
    document.body.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  }, "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv");
  await expect(editor.getByRole("main").getByText("Bleach")).toBeVisible({ timeout: 10_000 });
  await owner.goto(`/l/${doom.id}`);
  await expect(owner.getByRole("main").getByText("Bleach")).toBeVisible();

  // Add albums starts with the list on view.
  await editor.keyboard.press("c");
  const adding = editor.getByRole("dialog", { name: "Add albums" });
  await expect(adding.getByRole("combobox", { name: "List", exact: true })).toHaveText(
    "Metal › Doom",
  );
  await editor.keyboard.press("Escape");
  await expect(adding).toHaveCount(0);

  // Sharing is the owner's: ⇧S opens nothing here.
  await editor.keyboard.press("Shift+S");
  await expect(editor.getByRole("dialog", { name: /^Share/ })).toHaveCount(0);

  // Offline, Delete list waits like every other edit.
  const remove = editor.getByRole("main").getByRole("button", { name: "Delete list" });
  await expect(remove).toBeEnabled();
  await editor.context().setOffline(true);
  await expect(remove).toBeDisabled();
  await editor.context().setOffline(false);
});

test("inside a share, shortcuts, Move to and deletions keep to the share and its owner's Trash (TON-195)", async ({
  page: owner,
  browser,
}) => {
  const {
    page: editor,
    metal,
    doom,
    nightfall,
  } = await sharedToEdit(owner, browser, accounts.toolsOwner, accounts.toolsEditor);
  const funeral = container("folder", "Funeral", metal.id);
  const secret = container("list", "Secret");
  await insert(owner, funeral, secret);
  await saved(owner);
  await send(owner, "membership.add", { listId: secret.id, albumId: nightfall.id });

  // N in the shared folder asks for the new list's name, here rather than in the sidebar.
  await editor.goto(`/shared/${metal.id}`);
  // Editable once Shared with me says so; until then it's the viewer's page.
  await expect(editor.getByText("Can edit · Shared by Denis")).toBeVisible();
  await editor.keyboard.press("n");
  const naming = editor.getByRole("dialog", { name: `New list in "Metal"` });
  await naming.getByRole("textbox", { name: "Name" }).fill("Sludge");
  await naming.getByRole("button", { name: "Create" }).click();
  await expect(naming).toHaveCount(0);
  await expect(editor.getByRole("main").getByText("Sludge")).toBeVisible();

  // M on the shared folder itself: it stays where its owner put it.
  await editor.keyboard.press("m");
  const pinned = editor.getByRole("dialog", { name: "Move 'Metal' to…" });
  await expect(pinned).toContainText(
    "Only its owner can move or delete the shared folder or list itself.",
  );
  await expect(pinned.getByRole("option")).toHaveCount(0);
  await editor.keyboard.press("Escape");
  await expect(pinned).toHaveCount(0);

  // M on a list inside: only the share's folders, previewed without naming anyone.
  await editor.goto(`/shared/${metal.id}?c=${doom.id}`);
  await expect(editor.getByText("Can edit · Shared by Denis")).toBeVisible();
  await editor.keyboard.press("m");
  const picker = editor.getByRole("dialog", { name: "Move 'Doom' to…" });
  await expect(picker.getByRole("option", { name: "Collection", exact: true })).toHaveCount(0);
  await expect(picker.getByRole("option", { name: "Private", exact: true })).toHaveCount(0);
  const funeralPlace = picker.getByRole("option", { name: "Metal › Funeral" });
  await funeralPlace.hover();
  await expect(picker.getByRole("status", { name: "Sharing" })).toHaveText("Sharing unchanged");
  await funeralPlace.click();
  await expect(picker).toHaveCount(0);
  await expect(editor.getByRole("main").getByRole("navigation")).toContainText("Funeral");

  // Deleting an album asks first, and leaves the owner's other lists alone.
  await editor.goto(`/shared/${metal.id}?c=${doom.id}&album=${nightfall.id}`);
  await expect(editor.getByText("Can edit · Shared by Denis")).toBeVisible();
  await editor.keyboard.press("e");
  await editor.keyboard.press("ControlOrMeta+Backspace");
  const confirm = editor.getByRole("alertdialog", { name: "Delete 'Nightfall' from 'Metal'?" });
  await expect(confirm).toContainText("Denis's other lists keep it.");
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(editor.getByRole("main").getByText("Nightfall")).toHaveCount(0);
  await owner.goto(`/l/${secret.id}`);
  await live(owner);
  await expect(owner.getByRole("main").getByText("Nightfall")).toBeVisible();
});
