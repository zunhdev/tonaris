// Copying a share in a real browser (FR-07.22, AC-51; TON-133): a viewer copies a shared folder into their
// collection, after the dialog says what it adds, and opens the copy; the original stays in Shared with me.

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Browser, type Page } from "./support/test";
import {
  added,
  album,
  insert,
  live,
  saved,
  toasts,
  violations,
  webOrigin,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
  color: null,
});

async function send(page: Page, name: string, args: Record<string, unknown>) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name, args },
  });
  const body = await response.json();
  expect(body.outcome?.status, JSON.stringify(body)).toBe("confirmed");
}

async function signedIn(browser: Browser, address: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, address);
  await live(page);
  return page;
}

test("a shared folder is copied into the viewer's collection, after saying what it adds", async ({
  page,
  browser,
}) => {
  // Denis shares "Metal", holding "Doom" with two albums, with the viewer.
  const owner = await signedIn(browser, accounts.copyOwner);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  await insert(owner, metal, doom);
  await added(owner, [album("Dopesmoker"), album("Holy Mountain")], doom.id);
  await saved(owner);
  await send(owner, "account.setDisplayName", { displayName: "Denis" });
  await signIn(page, accounts.copyViewer);
  await live(page);
  const grantId = uuidv7();
  await send(owner, "share.invite", { grantId, containerId: metal.id, email: accounts.copyViewer });
  await send(page, "share.accept", { grantId });

  await page.goto(`/shared/${metal.id}`);
  await page.getByRole("button", { name: "Copy to my collection…" }).click();
  const dialog = page.getByRole("dialog", { name: "Copy 'Metal' to your collection" });
  await expect(dialog.getByRole("combobox", { name: "Find a folder" })).toBeFocused();
  await dialog.getByRole("option", { name: "Collection", exact: true }).click();
  await expect(dialog.getByRole("status", { name: "What it adds" })).toContainText(
    "It adds 1 folder, 1 list and 2 albums.",
  );
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Metal");
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The copy is theirs, in the sidebar, and opens from the toast.
  const copied = toasts(page).filter({ hasText: "Copied 'Metal' to your collection" });
  await expect(copied).toBeVisible();
  // Their copy, and the share they still have in Shared with me.
  await expect(page.getByRole("tree").getByRole("treeitem", { name: /^Metal/ })).toHaveCount(2);
  await copied.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/f\//);
  await expect(page.getByRole("main")).toContainText("Doom");

  // The original stays in Shared with me.
  await page.goto("/shared");
  await expect(page.getByRole("main")).toContainText("Metal");
});
