// The invite field's suggestions in a real browser (DS-65; FR-07.3, FR-07.23; TON-294): the owner's people before
// typing, latest first, without the email of someone who invited them; found by typing and invited by Enter, by
// account; then no longer offered there; and Escape closing the suggestions before the dialog.

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Browser, type Page } from "./support/test";
import { insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const list = (name: string): Container => ({
  id: uuidv7(),
  kind: "list",
  parentId: null,
  name,
  description: null,
  color: null,
});

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

test("the owner's people are suggested, found by typing, and invited by account", async ({
  page,
  browser,
}) => {
  // Anna invites the owner to "Jazz", and he accepts: she becomes one of his people, by name only.
  const sharer = await signedIn(browser, accounts.peopleSharer);
  await send(sharer, "account.setDisplayName", { displayName: "Anna" });
  const jazz = list("Jazz");
  await insert(sharer, jazz);
  await saved(sharer);
  const fromAnna = uuidv7();
  await send(sharer, "share.invite", {
    grantId: fromAnna,
    containerId: jazz.id,
    email: accounts.peopleOwner,
  });

  await signIn(page, accounts.peopleOwner);
  await live(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  await send(page, "share.accept", { grantId: fromAnna });
  // He invites someone by address, to "Folk": the latest of his people.
  const folk = list("Folk");
  const doom = list("Doom");
  await insert(page, folk, doom);
  await saved(page);
  await send(page, "share.invite", {
    grantId: uuidv7(),
    containerId: folk.id,
    email: accounts.peopleFriend,
  });

  await page.goto(`/l/${doom.id}`);
  await live(page);
  await page.getByRole("button", { name: "Share" }).click();
  const share = page.getByRole("dialog", { name: `Share "Doom" · list` });
  const field = share.getByRole("combobox", { name: "Invite by name or email" });
  await field.focus();
  const options = share.getByRole("listbox", { name: "Your people" }).getByRole("option");
  await expect(options).toHaveText([accounts.peopleFriend, "Anna"]);
  // Anna invited him: her email is never shown (FR-07.3).
  await expect(share).not.toContainText(accounts.peopleSharer);
  expect(await violations(page, '[data-slot="dialog-content"]')).toEqual([]);
  // Escape closes the suggestions first; the dialog stays.
  const suggestions = share.getByRole("listbox", { name: "Your people" });
  await field.press("Escape");
  await expect(suggestions).toBeHidden();
  await expect(share).toBeVisible();

  // Typing finds her, and Enter invites her account, with the role beside the field.
  await field.fill("ann");
  await expect(options).toHaveText(["Anna"]);
  await share.getByRole("combobox", { name: "Role for the invitation" }).selectOption("edit");
  await field.focus();
  await field.press("Enter");
  const people = share.getByRole("list", { name: "People with access" });
  await expect(people.getByRole("listitem")).toHaveCount(1);
  await expect(people).toContainText("Anna");
  await expect(people).toContainText("Pending");
  await expect(share.getByRole("combobox", { name: "Role for Anna" })).toHaveValue("edit");
  await expect(share).not.toContainText(accounts.peopleSharer);
  await expect(field).toHaveValue("");

  // She has an invitation here now, so only the other is offered; ↓ and Enter invite him.
  await expect(options).toHaveText([accounts.peopleFriend]);
  await field.press("ArrowDown");
  await field.press("Enter");
  await expect(people.getByRole("listitem")).toHaveCount(2);
  await expect(people).toContainText(accounts.peopleFriend);

  // With nobody left to suggest, Escape closes the dialog.
  await expect(suggestions).toBeHidden();
  await field.press("Escape");
  await expect(share).toHaveCount(0);

  // Anna sees the invitation in her inbox.
  await sharer.goto("/invitations");
  await expect(sharer.getByText("A list from Denis, to edit")).toBeVisible();
});
