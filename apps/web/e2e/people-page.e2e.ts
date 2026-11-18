// The People page and a person's page in a real browser (DS-121; FR-07.15, FR-07.23, FR-07.24; TON-295): People in the
// sidebar, a row saying what's shared each way, found by typing; a person's page with both ways, opening the sharing
// dialog and the shared view; Stop sharing after the standard confirmation; and Remove from People.

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Browser, type Page } from "./support/test";
import { insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (kind: Container["kind"], name: string): Container => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
  description: null,
  color: null,
});

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

test("People lists what's shared each way; a person's page stops sharing and removes them", async ({
  page,
  browser,
}) => {
  // Anna shares "Jazz" with the owner, who accepts; he shares "Doom" and, to edit, "Metal" with her.
  const friend = await signedIn(browser, accounts.rosterFriend);
  await send(friend, "account.setDisplayName", { displayName: "Anna" });
  const jazz = container("list", "Jazz");
  await insert(friend, jazz);
  await saved(friend);
  const fromAnna = uuidv7();
  await send(friend, "share.invite", {
    grantId: fromAnna,
    containerId: jazz.id,
    email: accounts.rosterOwner,
  });

  await signIn(page, accounts.rosterOwner);
  await live(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  await send(page, "share.accept", { grantId: fromAnna });
  const doom = container("list", "Doom");
  const metal = container("folder", "Metal");
  await insert(page, doom, metal);
  await saved(page);
  await send(page, "share.invite", {
    grantId: uuidv7(),
    containerId: doom.id,
    email: accounts.rosterFriend,
  });
  await send(page, "share.invite", {
    grantId: uuidv7(),
    containerId: metal.id,
    email: accounts.rosterFriend,
    role: "edit",
  });

  // People, from the sidebar, after Shared with me.
  await page.getByRole("treeitem", { name: "People" }).click();
  await expect(page).toHaveURL(/\/people$/);
  const rows = page.getByRole("list", { name: "People" }).getByRole("link");
  await expect(rows).toHaveText([
    new RegExp(
      `Anna\\s*${accounts.rosterFriend}\\s*You share 1 list and 1 folder \\(1 to edit\\)\\s*Shares 1 list with you`,
    ),
  ]);
  const find = page.getByRole("searchbox", { name: "Find people" });
  await find.fill("zz");
  await expect(page.getByText("No one matches 'zz'.")).toBeVisible();
  await find.fill("ann");
  await expect(rows).toHaveCount(1);
  expect(await violations(page, "main")).toEqual([]);

  // Her page: both ways, by name.
  await rows.first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Anna" })).toBeVisible();
  const yours = page.getByRole("region", { name: "You share with Anna" }).getByRole("listitem");
  await expect(yours).toHaveText([
    /"Doom"\s*List · Can view · Pending/,
    /"Metal"\s*Folder, with everything inside it · Can edit · Pending/,
  ]);
  const theirs = page.getByRole("region", { name: "Anna shares with you" }).getByRole("listitem");
  await expect(theirs).toHaveText([/"Jazz"\s*List · Can view · Accepted/]);
  expect(await violations(page, "main")).toEqual([]);

  // One of yours opens its sharing dialog.
  await page.getByRole("button", { name: /"Doom"/ }).click();
  const share = page.getByRole("dialog", { name: `Share "Doom" · list` });
  await expect(share.getByRole("list", { name: "People with access" })).toContainText("Anna");
  await page.keyboard.press("Escape");
  await expect(share).toHaveCount(0);

  // Stop sharing: confirmed, listing what she loses; her share stays.
  await page.getByRole("button", { name: "Stop sharing with Anna…" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Stop sharing with Anna?" });
  await expect(confirm).toContainText(`"Metal" · folder, with everything inside it`);
  await confirm.getByRole("button", { name: "Stop sharing with Anna" }).click();
  await expect(page.getByText("You don't share anything with Anna.")).toBeVisible();
  await expect(theirs).toHaveCount(1);

  // One of theirs opens the shared view.
  await theirs.getByRole("link", { name: /Jazz/ }).click();
  await expect(page).toHaveURL(new RegExp(`/shared/${jazz.id}`));
  await page.goBack();

  // Remove from People: back on People, with nobody.
  await page.getByRole("button", { name: "Remove from People" }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(
    page.getByText(
      "Nobody yet. People you invite, and people whose invitations you accept, show here.",
    ),
  ).toBeVisible();
});
