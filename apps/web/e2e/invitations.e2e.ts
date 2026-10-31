// Sharing invitations in a real browser (DS-31, DS-65, DS-66; FR-07.5, FR-07.6; AC-22): the email in Mailpit linking
// to its page, its delivery in the owner's dialog, the recipient's sidebar count, accepting from the email, declining
// from the inbox, the page for an answered invitation and for someone else, and the owner removing access. A new one
// is announced in the open app, once (TON-129).

import { expect, test, type Browser, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { clearInbox, latestEmail } from "./support/mailpit";
import { signIn } from "./support/sign-in";
import { insert, live, saved, toasts, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const list = (name: string): Container => ({
  id: uuidv7(),
  kind: "list",
  parentId: null,
  name,
  description: null,
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

const invitationsItem = (page: Page) =>
  page.getByRole("tree").getByRole("treeitem", { name: /^Invitations/ });

test("an invitation is emailed, accepted from its link, and another declined from the inbox", async ({
  page,
  browser,
}) => {
  const anna = await signedIn(browser, accounts.invitedAnna);
  await expect(invitationsItem(anna)).toHaveCount(0);
  await clearInbox(accounts.invitedAnna);

  await signIn(page, accounts.invitingOwner);
  await live(page);
  const [doom, sludge, crust] = [list("Doom"), list("Sludge"), list("Crust")];
  await insert(page, doom, sludge, crust);
  await saved(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  const doomGrant = uuidv7();
  await send(page, "share.invite", {
    grantId: doomGrant,
    containerId: doom.id,
    email: accounts.invitedAnna,
  });

  // The email goes to Anna, linking to the invitation's page (FR-07.5).
  const email = await latestEmail(accounts.invitedAnna, 1);
  expect(email.subject).toBe(`Denis invited you to view "Doom" on Tonaris`);
  const link = /^(http\S+\/invitations\/\S+?)\r?$/m.exec(email.text)?.[1];
  expect(link).toBe(`${webOrigin}/invitations/${doomGrant}`);

  // The owner's dialog reports it sent.
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(
    page
      .getByRole("dialog", { name: `Share "Doom" · list` })
      .getByRole("list", { name: "People with access" }),
  ).toContainText("Pending · sent");
  await page.keyboard.press("Escape");

  const sludgeGrant = uuidv7();
  await send(page, "share.invite", {
    grantId: sludgeGrant,
    containerId: sludge.id,
    email: accounts.invitedAnna,
  });
  const crustGrant = uuidv7();
  await send(page, "share.invite", {
    grantId: crustGrant,
    containerId: crust.id,
    email: accounts.invitedAnna,
  });

  // Anna's sidebar shows them; she accepts Doom from the email's link (FR-07.6).
  await anna.reload();
  await live(anna);
  await expect(invitationsItem(anna)).toContainText("3");
  await anna.goto(link ?? "");
  await expect(anna.getByRole("main")).toContainText(`"Doom"`);
  await expect(anna.getByRole("main")).toContainText("A list from Denis");
  await anna.getByRole("button", { name: `Accept "Doom"` }).click();
  await expect(anna.getByRole("main")).toContainText("You accepted this invitation.");
  await expect(invitationsItem(anna)).toContainText("2");

  // She declines Sludge from the inbox.
  await invitationsItem(anna).click();
  await expect(anna).toHaveURL("/invitations");
  const pending = anna.getByRole("list", { name: "Pending invitations" });
  await expect(pending.getByRole("listitem")).toHaveCount(2);
  expect(await violations(anna, "main")).toEqual([]);
  await pending.getByRole("button", { name: `Decline "Sludge"` }).click();
  await expect(pending.getByRole("listitem")).toHaveCount(1);
  await expect(invitationsItem(anna)).toContainText("1");

  // Answered invitations, and someone else's.
  await anna.goto(`/invitations/${doomGrant}`);
  await expect(anna.getByRole("main")).toContainText("You accepted this invitation.");
  await anna.goto(`/invitations/${sludgeGrant}`);
  await expect(anna.getByRole("main")).toContainText("This invitation is no longer available.");
  const ben = await signedIn(browser, accounts.invitedBen);
  await ben.goto(`/invitations/${crustGrant}`);
  await expect(ben.getByRole("main")).toContainText(
    "This invitation is for a different account — sign out and sign in with that email.",
  );
  await expect(ben.getByRole("main")).not.toContainText("Crust");

  // The owner removes Anna's access to Doom (FR-07.15): her row goes, and her invitation is no longer available.
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await page.getByRole("button", { name: "Share" }).click();
  const people = page
    .getByRole("dialog", { name: `Share "Doom" · list` })
    .getByRole("list", { name: "People with access" });
  await expect(people).toContainText("Accepted");
  await people.getByRole("button", { name: `More for ${accounts.invitedAnna}` }).click();
  await page.getByRole("menuitem", { name: "Remove access" }).click();
  await expect(people).toHaveCount(0);
  await anna.goto(`/invitations/${doomGrant}`);
  await expect(anna.getByRole("main")).toContainText("This invitation is no longer available.");
});

test("a new invitation is announced in the open app, once, and several together", async ({
  page,
  browser,
}) => {
  const viewer = await signedIn(browser, accounts.noticedViewer);
  await signIn(page, accounts.noticingOwner);
  await live(page);
  const [doom, sludge, crust] = [list("Doom"), list("Sludge"), list("Crust")];
  await insert(page, doom, sludge, crust);
  await saved(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  const doomGrant = uuidv7();
  await send(page, "share.invite", {
    grantId: doomGrant,
    containerId: doom.id,
    email: accounts.noticedViewer,
  });

  // The open app notices it when the window regains focus, as it does every minute, and announces it.
  await viewer.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  const announced = toasts(viewer).filter({ hasText: 'Denis shared "Doom" with you' });
  await expect(announced).toBeVisible();
  await announced.getByRole("button", { name: "View" }).click();
  await expect(viewer).toHaveURL(`/invitations/${doomGrant}`);
  await expect(announced).toHaveCount(0);

  // Once on the device: not again after a reload.
  await viewer.goto("/c");
  await live(viewer);
  await expect(invitationsItem(viewer)).toContainText("1");
  await expect(toasts(viewer).filter({ hasText: "with you" })).toHaveCount(0);

  // Several at once come together.
  for (const each of [sludge, crust]) {
    // oxlint-disable-next-line no-await-in-loop
    await send(page, "share.invite", {
      grantId: uuidv7(),
      containerId: each.id,
      email: accounts.noticedViewer,
    });
  }
  await viewer.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
  const several = toasts(viewer).filter({ hasText: "2 new invitations" });
  await expect(several).toBeVisible();
  await several.getByRole("button", { name: "View" }).click();
  await expect(viewer).toHaveURL("/invitations");
});
