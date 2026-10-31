// The terms of use and the privacy notice (TON-131): public pages reached from sign-in, what YouTube's policies ask of
// them, and the one-time agreement screen a member from before the terms meets. Joining's line is in admission.e2e.ts.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signInEmail } from "./support/mailpit";
import { requestCode } from "./support/sign-in";
import { live } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

test("the terms and the privacy notice are public, linked from sign-in, and say what YouTube asks", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  const notice = page.getByRole("main", { name: "Privacy notice" });
  await expect(notice.getByText(/run by zunh\.dev/)).toBeVisible();
  await expect(notice.getByText(/uses YouTube API Services/)).toBeVisible();
  await expect(notice.getByRole("link", { name: "Google Privacy Policy" })).toHaveAttribute(
    "href",
    "https://policies.google.com/privacy",
  );
  // The support address, from the API's SUPPORT_EMAIL.
  await expect(notice.getByRole("link", { name: /@/ }).first()).toHaveAttribute("href", /^mailto:/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("link", { name: "Terms of use" }).click();
  const terms = page.getByRole("main", { name: "Terms of use" });
  await expect(terms.getByRole("link", { name: "YouTube Terms of Service" })).toHaveAttribute(
    "href",
    "https://www.youtube.com/t/terms",
  );
  await expect(terms.getByText(/agree to be bound by the/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a member from before the terms agrees once, and then goes straight to the collection", async ({
  page,
}) => {
  // Signed in, the workspace never goes live behind the screen, so this signs in without waiting for it.
  await requestCode(page, accounts.unagreed);
  const { code } = await signInEmail(accounts.unagreed);
  await page.getByLabel("Code", { exact: true }).fill(code);
  const heading = page.getByRole("heading", { name: "Tonaris has terms and a privacy notice" });
  await expect(heading).toBeVisible();
  await expect(page.getByRole("main", { name: "Collection" })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "Agree and continue" }).click();
  await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
  await live(page);

  await page.reload();
  await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
  await expect(heading).toHaveCount(0);
});
