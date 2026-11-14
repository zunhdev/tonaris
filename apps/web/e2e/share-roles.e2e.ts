// Roles in a real browser (DS-65–DS-67; FR-07.14, FR-07.18; TON-190): the dialog explains what editors may do,
// invites to edit, changes a role in place, and says a person edits a list through its folder; the person's inbox,
// Shared with me and sidebar tree say they can edit.

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Browser, type Page } from "./support/test";
import { insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({ id: uuidv7(), kind, parentId, name, description: null, color: null });

/** Sends a mutation as the page's account, as the sharing dialog does. */
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

test("the owner invites to edit and changes a role; the person sees they can edit, also through a folder", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.roleOwner);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  await insert(page, metal, doom);
  await saved(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });

  await page.goto(`/f/${metal.id}`);
  await live(page);
  await page.getByRole("button", { name: "Share" }).click();
  const share = page.getByRole("dialog", { name: `Share "Metal" · folder` });
  // What editors may do is said before anyone is invited (FR-07.14).
  await expect(share).toContainText(
    "People who can edit also add, change, move and delete what's inside, and what they add stays in your collection.",
  );
  await share.getByRole("textbox", { name: "Invite by email" }).fill(accounts.roleInvitee);
  const inviteRole = share.getByRole("combobox", { name: "Role for the invitation" });
  await expect(inviteRole).toHaveValue("view");
  await inviteRole.selectOption("edit");
  await share.getByRole("button", { name: "Invite" }).click();
  const role = share.getByRole("combobox", { name: `Role for ${accounts.roleInvitee}` });
  await expect(role).toHaveValue("edit");
  // A change saves at once, and the dialog reads it back (FR-07.18).
  await role.selectOption("view");
  await expect(role).toHaveValue("view");
  await role.selectOption("edit");
  await expect(role).toHaveValue("edit");
  expect(await violations(page, '[data-slot="dialog-content"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(share).toHaveCount(0);

  // The person's inbox says the invitation is to edit; they accept it.
  const invitee = await signedIn(browser, accounts.roleInvitee);
  await invitee.goto("/invitations");
  await expect(invitee.getByText("A folder from Denis, to edit")).toBeVisible();
  await invitee.getByRole("button", { name: `Accept "Metal"` }).click();
  await expect(invitee.getByText(`Accepted "Metal".`)).toBeVisible();

  // Shared with me and the tree say they can edit it (DS-67).
  await invitee.goto("/shared");
  await expect(invitee.getByText("Folder · by invitation · you can edit")).toBeVisible();
  await expect(
    invitee.getByRole("tree").getByRole("treeitem", { name: /Metal.*you can edit this/ }),
  ).toBeVisible();

  // Invited to view "Doom" inside "Metal", the owner's dialog says they edit it through "Metal" (FR-07.18).
  await send(page, "share.invite", {
    grantId: uuidv7(),
    containerId: doom.id,
    email: accounts.roleInvitee,
  });
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await page.getByRole("button", { name: "Share" }).click();
  const doomShare = page.getByRole("dialog", { name: `Share "Doom" · list` });
  await expect(
    doomShare.getByRole("combobox", { name: `Role for ${accounts.roleInvitee}` }),
  ).toHaveValue("view");
  await expect(doomShare).toContainText(`Also editable through "Metal"`);
});
