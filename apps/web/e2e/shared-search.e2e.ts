// Shared content in the palette (FR-12.3, DS-75; AC-25's shared part): a list shared through a folder is found under
// Shared with me, "Shared by Denis · Metal", and opens in the viewer page; the private folder above it is never found
// or named; a shared album shows only its shared list; and once access is revoked, nothing is found.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

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

const container = (kind: Container["kind"], name: string, parentId: string | null): Container => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
});

test("shared content is found from its shared root, opens view-only, and goes once revoked", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.searchOwner);
  await live(page);
  const hidden = container("folder", "Private", null);
  const metal = container("folder", "Metal", hidden.id);
  const doom = container("list", "Doom", metal.id);
  const secret = container("list", "Secret", null);
  await insert(page, hidden, metal, doom, secret);
  await saved(page);
  const nightfall = album("Nightfall", { originalYear: 1987 });
  await added(page, [nightfall], doom.id);
  await send(page, "membership.add", { listId: secret.id, albumId: nightfall.id });
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  const grantId = uuidv7();
  await send(page, "share.invite", {
    grantId,
    containerId: metal.id,
    email: accounts.searchViewer,
  });

  const viewer = await signedIn(browser, accounts.searchViewer);
  await send(viewer, "share.accept", { grantId });
  const palette = viewer.getByRole("dialog", { name: "Search" });
  const field = viewer.getByRole("combobox", { name: "Search" });
  const sharedGroup = palette.getByRole("group", { name: "Shared with me", exact: true });
  await viewer.keyboard.press("ControlOrMeta+k");

  await field.fill("doom");
  await expect(sharedGroup.getByRole("option")).toHaveCount(1);
  await expect(sharedGroup.getByRole("option")).toContainText("Doom");
  await expect(sharedGroup.getByRole("option")).toContainText("Shared by Denis · Metal");
  expect(await violations(viewer, '[data-slot="command-content"]')).toEqual([]);

  // The shared album shows its shared list, not Denis's Secret.
  await field.fill("nightfall");
  await expect(sharedGroup.getByRole("option")).toContainText("Shared by Denis · Metal › Doom");
  await expect(sharedGroup.getByRole("option")).not.toContainText("more");

  // Neither the private folder above, nor the private list.
  for (const q of ["private", "secret"]) {
    // oxlint-disable-next-line no-await-in-loop
    await field.fill(q);
    // oxlint-disable-next-line no-await-in-loop
    await expect(palette).toContainText(`No results for '${q}'.`);
  }

  // Opens in the viewer page.
  await field.fill("doom");
  await sharedGroup.getByRole("option").click();
  // Keys pressed while the palette is still closing are ignored.
  await expect(palette).toHaveCount(0);
  await expect(viewer).toHaveURL(new RegExp(`/shared/${metal.id}\\?c=${doom.id}$`));
  await expect(viewer.getByRole("heading", { level: 1 })).toHaveText("Doom");

  // Revoked, it's gone.
  await send(page, "share.revoke", { grantId });
  await viewer.keyboard.press("ControlOrMeta+k");
  await field.fill("doom");
  await expect(palette).toContainText("No results for 'doom'.");
});
