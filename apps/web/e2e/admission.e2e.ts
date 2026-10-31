// admission spec (FR-11.2, FR-11.3, FR-11.6, DS-91, DS-100, AC-01, AC-02). Admin → Admissions: the creator invites
// an address and sees its status and email delivery, a member's address is refused, Revoke ends an invitation, and
// the switch pauses and resumes admissions with its note; other accounts have no Admin. Joining: the invitation's
// link shows its address, the emailed code or its link creates the account, an optional name, the first run, and
// signing in again; an unusable invitation shows only its sentence.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { accounts, apiUrl, invitee, joiners } from "./support/accounts";
import { clearInbox, invitationEmail, joinEmail, latestEmail } from "./support/mailpit";
import { signIn } from "./support/sign-in";

// Pausing admissions is service-wide, so this file's tests run in order: a pause never lands mid-join.
test.describe.configure({ mode: "default" });

async function openAdmin(page: Page) {
  await page.goto("/c");
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/admissions$/);
  // The menu leaves after its exit animation; the page's checks start once it has gone.
  await expect(page.getByRole("menu")).toHaveCount(0);
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

/** The creator invites `email` through the API, as Admin → Admissions does; answers the invitation's ID. */
async function invite(page: Page, baseURL: string | undefined, email: string): Promise<string> {
  await clearInbox(email);
  const response = await page.request.post(`${apiUrl}/v1/admin/admissions/invitations`, {
    data: { email },
    headers: { origin: baseURL ?? "" },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  const id = typeof body === "object" && body !== null && "id" in body ? body.id : undefined;
  if (typeof id !== "string") throw new Error("The invitation has no ID");
  return id;
}

test.describe("joining", () => {
  test("an invited person joins with the emailed code, adds a name, and returns to the same account", async ({
    page,
    browser,
    baseURL,
  }) => {
    const email = joiners.member;
    await invite(page, baseURL, email);
    const { link } = await invitationEmail(email);

    const context = await browser.newContext();
    const guest = await context.newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: "You're invited to Tonaris" })).toBeVisible();
    await expect(guest.getByText(`This invitation is for ${email}.`)).toBeVisible();
    // Continuing agrees to the terms, which the account then records: no agreement screen follows (TON-131).
    await expect(
      guest.getByText("By continuing, you agree to the Terms of use and the Privacy notice."),
    ).toBeVisible();
    await expect(guest.getByRole("link", { name: "Privacy notice" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect((await new AxeBuilder({ page: guest }).analyze()).violations).toEqual([]);

    await guest.getByRole("button", { name: "Continue" }).click();
    await expect(guest.getByRole("heading", { name: `Check ${email}` })).toBeVisible();
    expect((await new AxeBuilder({ page: guest }).analyze()).violations).toEqual([]);
    const { code } = await joinEmail(email, 2);
    await guest.getByLabel("Code", { exact: true }).fill(code);

    await expect(guest.getByRole("heading", { name: "Add a display name" })).toBeVisible();
    await guest.getByRole("textbox", { name: "Display name" }).fill("Anna");
    await guest.getByRole("button", { name: "Save" }).click();

    // The first run (DS-105).
    await expect(guest.getByRole("main", { name: "Collection" })).toBeVisible();
    await expect(
      guest.getByText("Start your collection — paste an album link or create a list."),
    ).toBeVisible();
    await expect(guest.getByRole("button", { name: "New list", exact: true })).toBeVisible();
    await expect(guest.getByRole("link", { name: "Connect an AI assistant" })).toHaveAttribute(
      "href",
      "/settings/connections",
    );

    // Signing in again reaches the same account, with its name.
    const account = guest.getByRole("button", { name: "Account: Anna" });
    await account.click();
    await guest.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(guest).toHaveURL(/\/sign-in/);
    await signIn(guest, email);
    await expect(account).toBeVisible();
    await context.close();
  });

  test("a wrong code is explained, and the code's link in another browser asks first", async ({
    page,
    browser,
    baseURL,
  }) => {
    const email = joiners.elsewhere;
    await invite(page, baseURL, email);
    const { link } = await invitationEmail(email);

    const asking = await browser.newContext();
    const here = await asking.newPage();
    await here.goto(link);
    await here.getByRole("button", { name: "Continue" }).click();
    const { code, link: codeLink } = await joinEmail(email, 2);
    await here.getByLabel("Code", { exact: true }).fill(code === "000000" ? "111111" : "000000");
    await expect(here.getByRole("alert")).toHaveText(
      "That code isn't right. Check the email and try again.",
    );

    const other = await browser.newContext();
    const there = await other.newPage();
    await there.goto(codeLink);
    await expect(there.getByRole("heading", { name: "Join on this device?" })).toBeVisible();
    await expect(
      there.getByText(`This link creates your Tonaris account for ${email}.`),
    ).toBeVisible();
    await there.getByRole("button", { name: "Join", exact: true }).click();
    await expect(there.getByRole("heading", { name: "Add a display name" })).toBeVisible();
    await there.getByRole("button", { name: "Skip for now" }).click();
    await expect(there.getByRole("main", { name: "Collection" })).toBeVisible();
    await expect(there.getByRole("button", { name: `Account: ${email}` })).toBeVisible();
    await asking.close();
    await other.close();
  });

  test("an invitation that can't be used shows only its sentence", async ({
    page,
    browser,
    baseURL,
  }) => {
    const email = joiners.withdrawn;
    const id = await invite(page, baseURL, email);
    const { link } = await invitationEmail(email);
    const revoked = await page.request.post(
      `${apiUrl}/v1/admin/admissions/invitations/${id}/revoke`,
      { data: {}, headers: { origin: baseURL ?? "" } },
    );
    expect(revoked.status()).toBe(200);

    const context = await browser.newContext();
    const guest = await context.newPage();
    await guest.goto(link);
    await expect(
      guest.getByRole("heading", { name: "This invitation has been withdrawn." }),
    ).toBeVisible();
    await expect(guest.getByRole("button")).toHaveCount(0);

    await guest.goto("/join/not-a-token");
    await expect(
      guest.getByRole("heading", { name: "This invitation link isn't valid." }),
    ).toBeVisible();
    await context.close();
  });
});
