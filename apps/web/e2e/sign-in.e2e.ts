// accounts, admission and app-shell specs in the browser: signing in with a code or the emailed link, the
// session the API sees, sign-out, and the signed-out workspace (FR-11.1, FR-11.2; DS-90, TS-70). Each test
// starts signed out and uses its own account and inbox.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { accounts, apiUrl, nobody } from "./support/accounts";
import { clearInbox, latestEmail, signInEmail } from "./support/mailpit";
import { requestCode, signIn } from "./support/sign-in";

test.use({ storageState: { cookies: [], origins: [] } });

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });

async function signedInAs(page: Page, email: string) {
  await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
  await expect(sidebar(page).getByRole("button", { name: `Account: ${email}` })).toBeVisible();
}

test("a signed-out visit asks for sign-in, and the code returns to the page", async ({ page }) => {
  await page.goto("/c");
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fc$/);

  await requestCode(page, accounts.code, "");
  await expect(
    page.getByText("Or open the link in the email to sign in on that device."),
  ).toBeVisible();
  const { code } = await signInEmail(accounts.code);
  // Pasted with a space, as some mail apps copy it; the six digits sign in by themselves.
  await page.getByLabel("Code", { exact: true }).fill(`${code.slice(0, 3)} ${code.slice(3)}`);

  await expect(page).toHaveURL(/\/c$/);
  await signedInAs(page, accounts.code);
});

test("the session reaches the API, in the agreed cookie", async ({ page }) => {
  await signIn(page, accounts.session);
  const me = await page.request.get(`${apiUrl}/v1/me`);
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({
    email: accounts.session,
    role: "user",
    displayName: null,
  });

  // The WebKit run's API sets plain cookies, as Playwright's WebKit keeps no Secure one on localhost (TON-94).
  if (process.env.E2E_INSECURE_COOKIES === "1") return;
  const cookies = await page.context().cookies(apiUrl);
  expect(
    cookies.map(({ name, httpOnly, secure, sameSite }) => ({ name, httpOnly, secure, sameSite })),
  ).toEqual([
    { name: "__Secure-tonaris.session_token", httpOnly: true, secure: true, sameSite: "Lax" },
  ]);
});

test("the link signs in the browser that asked, without the code", async ({ page }) => {
  await requestCode(page, accounts.link);
  const { link } = await signInEmail(accounts.link);

  // A mail app opens the link in a new tab of the same browser.
  const tab = await page.context().newPage();
  await tab.goto(link);
  await expect(tab).toHaveURL(/\/c$/);
  await signedInAs(tab, accounts.link);
});

test("the link on another device asks first", async ({ page, browser }) => {
  await requestCode(page, accounts.device);
  const { link } = await signInEmail(accounts.device);

  const other = await browser.newContext();
  const elsewhere = await other.newPage();
  await elsewhere.goto(link);
  await expect(elsewhere.getByRole("heading", { name: "Sign in on this device?" })).toBeVisible();
  // The code leaves the address bar before anything else happens.
  expect(new URL(elsewhere.url()).hash).toBe("");

  await elsewhere.getByRole("button", { name: "Cancel" }).click();
  await expect(elsewhere).toHaveURL(/\/sign-in$/);
  expect((await elsewhere.request.get(`${apiUrl}/v1/me`)).status()).toBe(401);

  await elsewhere.goto(link);
  await elsewhere.getByRole("button", { name: "Sign in" }).click();
  await expect(elsewhere).toHaveURL(/\/c$/);
  await signedInAs(elsewhere, accounts.device);
  await other.close();
});

test("a used link is explained and offers a new code", async ({ page, browser }) => {
  await requestCode(page, accounts.usedLink);
  const { link } = await signInEmail(accounts.usedLink);
  // Pasted into the tab that shows the code screen: only the fragment changes.
  await page.goto(link);
  await signedInAs(page, accounts.usedLink);

  const other = await browser.newContext();
  const elsewhere = await other.newPage();
  await elsewhere.goto(link);
  await elsewhere.getByRole("button", { name: "Sign in" }).click();
  await expect(
    elsewhere.getByRole("heading", { name: "This sign-in link has expired or was already used" }),
  ).toBeVisible();

  await elsewhere.getByRole("button", { name: "Send a new code" }).click();
  await expect(
    elsewhere.getByRole("heading", { name: `Check ${accounts.usedLink}` }),
  ).toBeVisible();
  await expect(elsewhere.getByRole("status")).toHaveText(
    `We sent a new code to ${accounts.usedLink}.`,
  );
  await latestEmail(accounts.usedLink, 2);
  await other.close();
});

test("an unknown address sees the same screen and gets a no-account email", async ({ page }) => {
  await requestCode(page, nobody);
  await expect(page.getByLabel("Code", { exact: true })).toBeVisible();

  const { subject, text } = await latestEmail(nobody);
  expect(subject).toBe("Signing in to Tonaris");
  expect(text).toContain("there is no Tonaris account for it");
  expect(text).not.toMatch(/\d{6}/);
});

test("a wrong code is rejected", async ({ page }) => {
  await requestCode(page, accounts.wrongCode);
  const { code } = await signInEmail(accounts.wrongCode);
  await page.getByLabel("Code", { exact: true }).fill(code === "000000" ? "111111" : "000000");

  await expect(page.getByRole("alert")).toHaveText(
    "That code isn't right. Check the email and try again.",
  );
  await expect(page.getByRole("heading", { name: `Check ${accounts.wrongCode}` })).toBeVisible();
  await expect(page.getByLabel("Code", { exact: true })).toBeFocused();
});

test("resending waits 30 seconds", async ({ page }) => {
  await page.clock.install();
  await requestCode(page, accounts.resend);
  const resend = page.getByRole("button", { name: /^Resend code/ });
  await expect(resend).toBeDisabled();
  await expect(resend).toHaveText(/^Resend code in (29|30)s$/);

  await page.clock.fastForward(30_000);
  await expect(resend).toHaveText("Resend code");
  await resend.click();
  await expect(page.getByRole("status")).toHaveText(`We sent a new code to ${accounts.resend}.`);
  await latestEmail(accounts.resend, 2);
  await expect(resend).toBeDisabled();

  await page.getByRole("link", { name: "Use a different email" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("signing out ends the session", async ({ page }) => {
  await signIn(page, accounts.signOut);
  await sidebar(page)
    .getByRole("button", { name: `Account: ${accounts.signOut}` })
    .click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.request.get(`${apiUrl}/v1/me`)).status()).toBe(401);
  await page.goto("/c");
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fc$/);
});

test("sign-in ignores destinations outside the app", async ({ page }) => {
  await signIn(page, accounts.unsafe, "/sign-in?redirect=%2F%2Fevil.example");
  await expect(page).toHaveURL(/^http:\/\/localhost:3100\/c$/);
});

for (const path of ["/sign-in", `/sign-in/verify?email=${encodeURIComponent(nobody)}`]) {
  test(`${path.split("?")[0]} has no axe violations`, async ({ page }) => {
    await clearInbox(nobody);
    await page.goto(path);
    await page.getByRole("main").waitFor();
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map(({ id, nodes }) => `${id} (${nodes.length})`)).toEqual([]);
  });
}
