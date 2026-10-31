// Shared folders and lists in the sidebar's tree (TON-130; DS-31, DS-67, DS-70): Shared with me starts open, with
// each shared folder or list and its owner; a shared folder opens to what's inside it, from the pointer or the
// keyboard; a click opens the shared view, which the tree marks; the owner's saves show while it's open; ← goes up,
// closing a folder that holds the view opens its view, and Shared with me stays closed on the device until a shared
// view opens it again.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description: null });

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

test("shared folders and lists show in the sidebar's tree, open their views, and follow the owner", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.sidebarOwner);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("folder", "Doom", metal.id);
  const funeral = container("list", "Funeral", doom.id);
  const thrash = container("list", "Thrash", metal.id);
  await insert(page, metal, doom, funeral, thrash);
  await saved(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  const grantId = uuidv7();
  await send(page, "share.invite", {
    grantId,
    containerId: metal.id,
    email: accounts.sidebarViewer,
  });

  const viewer = await signedIn(browser, accounts.sidebarViewer);
  await send(viewer, "share.accept", { grantId });
  const tree = viewer.getByRole("tree", { name: "Collection" });
  const item = (name: string) => tree.getByRole("treeitem", { name, exact: true });
  const sharedWithMe = item("Shared with me");
  const shared = item("Metal · Denis");

  // Shared with me starts open, with what's shared and its owner; a shared folder starts closed.
  await expect(sharedWithMe).toHaveAttribute("aria-expanded", "true");
  await expect(shared).toHaveAttribute("aria-level", "2");
  await expect(shared).toHaveAttribute("aria-expanded", "false");
  await expect(item("Doom")).toHaveCount(0);

  // It opens like a folder of your own, from the keyboard, to what's inside in your own order (manual, by creation).
  await shared.focus();
  await viewer.keyboard.press("ArrowRight");
  await expect(shared).toHaveAttribute("aria-expanded", "true");
  await expect(item("Doom")).toHaveAttribute("aria-level", "3");
  await expect(item("Thrash")).toHaveAttribute("aria-level", "3");
  await expect(item("Doom")).toHaveAttribute("aria-posinset", "1");
  expect(await violations(viewer, '[role="tree"]')).toEqual([]);

  // A click opens the shared view, and the tree marks it.
  await item("Thrash").click();
  await expect(viewer).toHaveURL(new RegExp(`/shared/${metal.id}\\?c=${thrash.id}$`));
  await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("Thrash");
  await expect(item("Thrash")).toHaveAttribute("aria-selected", "true");

  // The owner's saves show while it's open.
  await insert(page, container("list", "Black", metal.id));
  await expect(item("Black")).toBeVisible();

  // ← goes up; closing a folder that holds the view opens its view (TON-121), and Shared with me closes the same way.
  await item("Thrash").focus();
  await viewer.keyboard.press("ArrowLeft");
  await expect(shared).toBeFocused();
  await viewer.keyboard.press("ArrowLeft");
  await expect(shared).toHaveAttribute("aria-expanded", "false");
  await expect(viewer).toHaveURL(new RegExp(`/shared/${metal.id}$`));
  await viewer.keyboard.press("ArrowLeft");
  await expect(sharedWithMe).toBeFocused();
  await viewer.keyboard.press("ArrowLeft");
  await expect(sharedWithMe).toHaveAttribute("aria-expanded", "false");
  await expect(shared).toHaveCount(0);
  await expect(viewer).toHaveURL(/\/shared$/);

  // Closed, it stays closed on this device, until a shared view opens it and the folders above that view.
  await viewer.reload();
  await live(viewer);
  await expect(sharedWithMe).toHaveAttribute("aria-expanded", "false");
  await viewer.goto(`/shared/${metal.id}?c=${funeral.id}`);
  await expect(item("Funeral")).toHaveAttribute("aria-selected", "true");
  await expect(item("Doom")).toHaveAttribute("aria-expanded", "true");
});
