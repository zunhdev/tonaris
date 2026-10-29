// accounts spec, deleting an account (FR-11.10, FR-11.11, DS-97, AC-40 but its export offer): the Danger zone's
// dialog lists the consequences and waits for the typed email; deleting ends on "Your account has been deleted";
// the account's guest link is unavailable at once; its address signs in to nothing; Cancel changes nothing; and
// the creator has no Delete account.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { shareSettingsSchema, uuidv7 } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { latestEmail } from "./support/mailpit";
import { requestCode, signIn } from "./support/sign-in";
import { created, live, violations, webOrigin } from "./support/workspace";

async function send(page: Page, name: string, args: Record<string, unknown>) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name, args },
  });
  expect((await response.json()).outcome.status).toBe("confirmed");
}

async function openDialog(page: Page) {
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { name: "Danger zone" })).toBeVisible();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  return page.getByRole("dialog", { name: "Delete your account?" });
}

test.describe("a member", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("deletes their account after typing their email; its link and address reach nothing", async ({
    page,
    browser,
  }) => {
    const email = accounts.deleter;
    await signIn(page, email);
    await live(page);
    const doom = await created(page, "Doom");
    await send(page, "account.setDisplayName", { displayName: "Dee" });
    await send(page, "share.setLink", { containerId: doom.id, linkId: uuidv7(), enabled: true });
    const settings = shareSettingsSchema.parse(
      await (await page.request.get(`${apiUrl}/v1/containers/${doom.id}/sharing`)).json(),
    );
    const link = settings.link?.url ?? "";

    const dialog = await openDialog(page);
    for (const line of [
      "Your whole collection is removed permanently, including Unsorted and Trash.",
      "Everything you share becomes unavailable to everyone, including people with a link.",
      "Your AI connections are disconnected.",
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(dialog.getByText(line)).toBeVisible();
    }
    const remove = dialog.getByRole("button", { name: "Delete account permanently" });
    await expect(remove).toBeDisabled();
    await dialog.getByLabel(`Type ${email} to confirm`).fill("someone@else.test");
    await expect(remove).toBeDisabled();
    await dialog.getByLabel(`Type ${email} to confirm`).fill(email.toUpperCase());
    await expect(remove).toBeEnabled();
    expect(await violations(page, '[data-slot="dialog-content"]')).toEqual([]);

    await remove.click();
    await expect(page).toHaveURL("/account-deleted");
    await expect(page.getByRole("heading", { name: "Your account has been deleted" })).toBeVisible({
      timeout: 15_000,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // The link is gone for guests, and the address has no account.
    const guestContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guest = await guestContext.newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: "Not available" })).toBeVisible();
    await guestContext.close();
    await requestCode(page, email);
    expect((await latestEmail(email)).subject).toBe("Signing in to Tonaris");
  });

  test("Cancel changes nothing", async ({ page }) => {
    const email = accounts.deleteCancel;
    await signIn(page, email);
    const dialog = await openDialog(page);
    await dialog.getByLabel(`Type ${email} to confirm`).fill(email);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: `Account: ${email}` })).toBeVisible();
  });
});

test("the creator's account has no Delete account", async ({ page }) => {
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { name: "Danger zone" })).toBeVisible();
  await expect(
    page.getByText("The creator's account can't be deleted: it runs admissions."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete account", exact: true })).toHaveCount(0);
});
