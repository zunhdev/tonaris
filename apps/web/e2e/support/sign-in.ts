// Signing in through the pages, as a person would (DS-90).

import { expect, type Page } from "@playwright/test";

import { clearInbox, signInEmail } from "./mailpit";

/** Asks for a code on `/sign-in` (or the page already open there) and waits for the code screen. */
export async function requestCode(page: Page, email: string, from = "/sign-in"): Promise<void> {
  await clearInbox(email);
  if (from) await page.goto(from);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: `Check ${email}` })).toBeVisible();
}

/** Signs in with the emailed code and waits until the page leaves sign-in. */
export async function signIn(page: Page, email: string, from = "/sign-in"): Promise<void> {
  await requestCode(page, email, from);
  const { code } = await signInEmail(email);
  await page.getByLabel("Code", { exact: true }).fill(code);
  await expect(page).not.toHaveURL(/\/sign-in/);
}
