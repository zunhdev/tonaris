// accounts and admission specs, creator-assisted recovery (FR-11.5, FR-11.6, DS-93, DS-100, TS-73, AC-39's recovery
// part): sign-in links to the help page and its support address; Admin → Members lists accounts without their
// collections; the creator's recovery waits for the new address, whose link confirms it, moving the same account
// and signing it out; a cancelled recovery's link refuses; and other accounts find no Admin page.

import { AxeBuilder } from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

import { accounts, apiUrl, newAddresses } from "./support/accounts";
import { clearInbox, recoveryEmail } from "./support/mailpit";
import { signIn } from "./support/sign-in";

const signedOut = { cookies: [], origins: [] };

async function signedInPage(browser: Browser, address: string): Promise<Page> {
  const context = await browser.newContext({ storageState: signedOut });
  const page = await context.newPage();
  await signIn(page, address);
  return page;
}

async function openMembers(page: Page) {
  await page.goto("/admin/admissions");
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Members" })
    .click();
  await expect(page).toHaveURL("/admin/members");
  await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();
}

const row = (page: Page, email: string) =>
  page.getByRole("table", { name: "Members" }).getByRole("row").filter({ hasText: email });

/** The creator recovers `email` to `to` through the dialog. */
async function recover(page: Page, email: string, to: string) {
  await clearInbox(to);
  await row(page, email)
    .getByRole("button", { name: `Recover sign-in email for ${email}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Recover sign-in email" });
  await dialog.getByLabel("New email address").fill(to);
  await dialog.getByLabel("Reason").fill("Lost the old mailbox; confirmed on a call");
  await dialog.getByRole("button", { name: "Send verification" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    row(page, email).getByRole("cell", { name: `Waiting for verification · ${to}` }),
  ).toBeVisible();
}

test.describe("signed out", () => {
  test.use({ storageState: signedOut });

  test("sign-in links to the help page, which shows the support address", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Lost access to your email?" }).click();
    await expect(page).toHaveURL("/help/recovery");
    await expect(page.getByRole("heading", { name: "Lost access to your email?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "support@tonaris.test" })).toHaveAttribute(
      "href",
      "mailto:support@tonaris.test",
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test("the creator recovers a member's email; the new address confirms it, and signs in", async ({
  page,
  browser,
}) => {
  const member = accounts.recoverMember;
  const to = newAddresses.recovered;
  const memberPage = await signedInPage(browser, member);
  // A member finds no Admin page.
  await memberPage.goto("/admin/members");
  await expect(memberPage.getByRole("heading", { name: "Page not found" })).toBeVisible();

  await openMembers(page);
  await expect(row(page, member).getByRole("cell", { name: "—" }).first()).toBeVisible();
  await recover(page, member, to);
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);

  // Nothing has changed yet: the member is still signed in.
  expect((await memberPage.request.get(`${apiUrl}/v1/me`)).status()).toBe(200);

  const { link } = await recoveryEmail(to);
  const context = await browser.newContext({ storageState: signedOut });
  const confirming = await context.newPage();
  await confirming.goto(link);
  await expect(
    confirming.getByRole("heading", { name: "Confirm your new sign-in email" }),
  ).toBeVisible();
  await expect(confirming.getByLabel("Code", { exact: true })).toHaveValue(/^\d{6}$/);
  expect((await new AxeBuilder({ page: confirming }).analyze()).violations).toEqual([]);
  await confirming.getByRole("button", { name: "Confirm" }).click();
  await expect(
    confirming.getByRole("heading", { name: `Done — use ${to} to sign in.` }),
  ).toBeVisible();

  // The member's old session ended; the new address signs in to the same account.
  expect((await memberPage.request.get(`${apiUrl}/v1/me`)).status()).toBe(401);
  await signIn(confirming, to);
  await expect(confirming.getByRole("button", { name: `Account: ${to}` })).toBeVisible();
  await page.reload();
  await expect(row(page, to)).toBeVisible();
  await expect(row(page, member)).toHaveCount(0);
  await context.close();
  await memberPage.context().close();
});

test("a cancelled recovery's link refuses, and the email stays", async ({ page, browser }) => {
  const member = accounts.recoverCancelled;
  const to = newAddresses.notRecovered;
  await openMembers(page);
  await recover(page, member, to);
  await row(page, member)
    .getByRole("button", { name: `Cancel recovery for ${member}` })
    .click();
  await expect(row(page, member).getByRole("button", { name: /Cancel recovery/ })).toHaveCount(0);

  const { link } = await recoveryEmail(to);
  const context = await browser.newContext({ storageState: signedOut });
  const confirming = await context.newPage();
  await confirming.goto(link);
  await confirming.getByRole("button", { name: "Confirm" }).click();
  await expect(confirming.getByRole("alert")).toHaveText(
    "This recovery link isn't valid. Ask the creator for a new one.",
  );
  await expect(row(page, member)).toBeVisible();
  await context.close();
});
