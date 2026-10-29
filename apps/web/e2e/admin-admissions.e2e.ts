// admission spec, Admin → Admissions (FR-11.6, DS-100, AC-02): the creator invites an address and sees its
// status and email delivery, a member's address is refused, Revoke ends an invitation, and the switch pauses and
// resumes admissions with its note. Other accounts have no Admin, and find no page there.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { accounts, apiUrl, invitee } from "./support/accounts";
import { clearInbox, latestEmail } from "./support/mailpit";
import { signIn } from "./support/sign-in";

async function openAdmin(page: Page) {
  await page.goto("/c");
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/admissions$/);
  await expect(page.getByRole("heading", { name: "Admissions", level: 1 })).toBeVisible();
}

const row = (page: Page, email: string) =>
  page.getByRole("table", { name: "Invitations" }).getByRole("row").filter({ hasText: email });

test("the creator invites someone, sees the email sent, and revokes the invitation", async ({
  page,
}) => {
  await clearInbox(invitee);
  await openAdmin(page);

  await page.getByLabel("Email address to invite").fill(invitee);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByLabel("Email address to invite")).toHaveValue("");
  const invited = row(page, invitee);
  await expect(invited.getByRole("cell", { name: "Available" })).toBeVisible();
  // The page follows the send until it's done.
  await expect(invited.getByRole("cell", { name: "Sent" })).toBeVisible({ timeout: 10_000 });
  const { subject, text } = await latestEmail(invitee);
  expect(subject).toBe("You're invited to join Tonaris");
  expect(text).toMatch(/\/join\/\S+/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A member's address is refused, keeping what was typed.
  await page.getByLabel("Email address to invite").fill(accounts.adminOutsider);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    `${accounts.adminOutsider} already has a Tonaris account.`,
  );
  await expect(page.getByLabel("Email address to invite")).toHaveValue(accounts.adminOutsider);

  await invited.getByRole("button", { name: `Revoke the invitation to ${invitee}` }).click();
  await expect(invited.getByRole("cell", { name: "Revoked" })).toBeVisible();
  await expect(invited.getByRole("button", { name: /Revoke/ })).toHaveCount(0);
});

test("the switch pauses admissions with its note, and resumes them", async ({ page }) => {
  await openAdmin(page);
  const accepting = page.getByRole("switch", { name: "Accepting new members" });
  const note = page.getByText(
    "Existing members keep access; outstanding invitations stay as they are.",
  );
  await expect(accepting).toBeChecked();
  await expect(note).toHaveCount(0);
  try {
    await accepting.click();
    await expect(accepting).not.toBeChecked();
    await expect(note).toBeVisible();
    await expect(
      page.getByText("Paused: no one can join until you turn this back on."),
    ).toBeVisible();

    await accepting.click();
    await expect(accepting).toBeChecked();
    await expect(note).toHaveCount(0);
    await expect(page.getByText("On: people you invite can join.")).toBeVisible();
  } finally {
    // Pausing is service-wide: never leave it on for the other tests.
    await page.request.put(`${apiUrl}/v1/admin/admissions/paused`, {
      data: { paused: false },
      headers: { origin: new URL(page.url()).origin },
    });
  }
});

test.describe("another account", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("has no Admin, and finds no page there", async ({ page }) => {
    await signIn(page, accounts.adminOutsider);
    await page.getByRole("button", { name: `Account: ${accounts.adminOutsider}` }).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Admin" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/admin/admissions");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
