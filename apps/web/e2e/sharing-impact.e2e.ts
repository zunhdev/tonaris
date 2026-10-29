// Sharing previews before moves and recovery (DS-69; FR-07.9, FR-07.10, FR-07.14; AC-21): Move to… says who a
// destination would show the list to before it moves; restoring a shared list asks first, and Cancel leaves it in
// Trash; an unshared one restores at once.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { insert, live, saved, toasts, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (kind: Container["kind"], name: string): Container => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
  description: null,
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

const item = (page: Page, name: string) =>
  page.getByRole("tree").getByRole("treeitem", { name: new RegExp(`^${name}`) });

test("moves and recovery say who would see the content before they happen", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.impactOwner);
  await live(page);
  const [metal, heavy, doom, lone] = [
    container("folder", "Metal"),
    container("folder", "Heavy"),
    container("list", "Doom"),
    container("list", "Lone"),
  ];
  await insert(page, metal, heavy, doom, lone);
  await saved(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  const viewer = await signedIn(browser, accounts.impactViewer);
  await send(viewer, "account.setDisplayName", { displayName: "Anna" });
  const grantId = uuidv7();
  await send(page, "share.invite", {
    grantId,
    containerId: metal.id,
    email: accounts.impactViewer,
  });
  await send(viewer, "share.accept", { grantId });

  // Move to…: each destination's consequences before choosing.
  await item(page, "Doom").focus();
  await page.keyboard.press("m");
  const picker = page.getByRole("dialog", { name: "Move 'Doom' to…" });
  const preview = picker.getByRole("status", { name: "Sharing" });
  await picker.getByRole("button", { name: "Metal" }).focus();
  await expect(preview).toHaveText("Newly visible to Anna");
  await picker.getByRole("button", { name: "Heavy" }).focus();
  await expect(preview).toHaveText("Sharing unchanged");
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await picker.getByRole("button", { name: "Metal" }).click();
  await expect(item(page, "Doom")).toHaveAttribute("aria-level", "2");
  await saved(page);

  // Restoring the shared list asks first; Cancel leaves it in Trash.
  await send(page, "container.delete", { id: doom.id, unitId: uuidv7() });
  await send(page, "container.delete", { id: lone.id, unitId: uuidv7() });
  await page.goto("/trash");
  await live(page);
  const row = (name: string) =>
    page
      .getByRole("table", { name: "Trash" })
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) });
  await row("Doom").getByRole("button", { name: "Restore" }).click();
  const asked = page.getByRole("dialog", { name: "Restore 'Doom'?" });
  await expect(asked.getByRole("status", { name: "Sharing" })).toHaveText("Newly visible to Anna");
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await asked.getByRole("button", { name: "Cancel" }).click();
  await expect(asked).toHaveCount(0);
  await expect(row("Doom")).toBeVisible();
  await row("Doom").getByRole("button", { name: "Restore" }).click();
  await asked.getByRole("button", { name: "Restore" }).click();
  await expect(toasts(page).filter({ hasText: "Restored 'Doom'" })).toBeVisible();

  // Nobody else would see Lone: it comes back at once.
  await row("Lone").getByRole("button", { name: "Restore" }).click();
  await expect(toasts(page).filter({ hasText: "Restored 'Lone'" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
