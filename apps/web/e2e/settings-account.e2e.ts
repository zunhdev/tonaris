// accounts spec, Settings → Account (FR-11.4, DS-93, TS-73, AC-39's self-service part): the sign-in email changes
// only after the current and then the new address's codes, the account's other sessions end, and the new address
// signs in to the same account. Cancelling changes nothing, a change resumes after a reload, and another
// account's address is refused.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { accounts, apiUrl, newAddresses } from "./support/accounts";
import { clearInbox, emailedCode } from "./support/mailpit";
import { signIn } from "./support/sign-in";

const signedOut = { cookies: [], origins: [] };
test.use({ storageState: signedOut });

async function openAccount(page: Page) {
  await page.goto("/settings/profile");
  const nav = page.getByRole("navigation", { name: "Settings" });
  await nav.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL("/settings/account");
  await expect(nav.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
}

const code = (page: Page) => page.getByLabel("Code", { exact: true });

test("the email changes after both codes, other sessions end, and the new address signs in", async ({
  page,
  browser,
}) => {
  const from = accounts.emailChanger;
  const to = newAddresses.moved;
  await clearInbox(to);
  const otherContext = await browser.newContext({ storageState: signedOut });
  const other = await otherContext.newPage();
  await signIn(other, from);
  await signIn(page, from);
  await openAccount(page);

  await page.getByRole("button", { name: "Change sign-in email" }).click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await page.getByLabel("New email address").fill(to);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: `Check ${from}` })).toBeVisible();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  await code(page).fill(await emailedCode(from, 2));

  await expect(page.getByRole("heading", { name: `Check ${to}` })).toBeVisible();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await code(page).fill(await emailedCode(to, 1));

  await expect(page.getByText(`Done — use ${to} to sign in.`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Account: ${to}` })).toBeVisible();

  // The other browser was signed out; the new address signs in to the same account there.
  expect((await other.request.get(`${apiUrl}/v1/me`)).status()).toBe(401);
  await signIn(other, to);
  await expect(other.getByRole("button", { name: `Account: ${to}` })).toBeVisible();
  await otherContext.close();
});

test("another account's address is refused, a change resumes after a reload, and Cancel changes nothing", async ({
  page,
}) => {
  const email = accounts.emailCanceller;
  await signIn(page, email);
  await openAccount(page);
  await page.getByRole("button", { name: "Change sign-in email" }).click();

  await page.getByLabel("New email address").fill(accounts.stranger);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "That address belongs to another Tonaris account.",
  );

  await page.getByLabel("New email address").fill(newAddresses.unused);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: `Check ${email}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `Check ${email}` })).toBeVisible();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Change sign-in email" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Change sign-in email" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Account: ${email}` })).toBeVisible();
});
