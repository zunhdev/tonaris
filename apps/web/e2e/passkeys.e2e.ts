// accounts spec, passkeys (FR-11.1, DS-90, DS-93, TON-143): a passkey added in Settings → Account, with its notice,
// can be renamed, signs in from the sign-in page without an email, through the email field's autofill and through
// the button, and once removed signs in to nothing. Chromium's virtual authenticator stands in for the device, and
// answers the autofill's request by itself, as choosing the passkey there would; Firefox and WebKit have none, so it
// runs on Chromium only.

import { AxeBuilder } from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { accounts } from "./support/accounts";
import { clearInbox, latestEmail } from "./support/mailpit";
import { signIn } from "./support/sign-in";

test.use({ storageState: { cookies: [], origins: [] } });

/** A platform authenticator that verifies the person at once, as a phone or a laptop with a fingerprint would. */
async function addAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** Turns the email field's autofill off, so only the button offers passkeys, as in a browser without it. */
async function withoutAutofill(page: Page) {
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
  });
}

async function signInWithPasskey(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
}

async function inWorkspace(page: Page) {
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.waitForFunction(() => window.tonarisSync?.engine.status === "live");
}

test("a passkey added in Settings signs in without an email, and once removed signs in to nothing", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Only Chromium has a virtual authenticator");
  const email = accounts.passkeyHolder;
  await addAuthenticator(context, page);
  await signIn(page, email);
  await clearInbox(email);

  await page.goto("/settings/account");
  const passkeys = page.getByRole("region", { name: "Passkeys" });
  await expect(passkeys.getByText("No passkeys yet.")).toBeVisible();
  await passkeys.getByRole("button", { name: "Add a passkey" }).click();
  await expect(passkeys.getByText("Passkey added.")).toBeVisible();
  await expect(passkeys.getByRole("listitem")).toHaveCount(1);
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  expect((await latestEmail(email)).subject).toBe("A passkey was added to your Tonaris account");

  // Renaming, in place of the row.
  const [name] = await passkeys.getByRole("listitem").locator("span").first().allTextContents();
  await passkeys.getByRole("button", { name: `Rename ${name}` }).click();
  await passkeys.getByLabel("Passkey name").fill("Test laptop");
  await passkeys.getByRole("button", { name: "Save" }).click();
  await expect(passkeys.getByText("Test laptop")).toBeVisible();

  // Signed out, the email field's autofill signs in with no email, to the workspace.
  await context.clearCookies();
  await page.goto("/sign-in");
  await inWorkspace(page);

  // And so does the button, where there's no autofill.
  await withoutAutofill(page);
  await context.clearCookies();
  await signInWithPasskey(page);
  await inWorkspace(page);
  expect((await latestEmail(email)).subject).toBe("A passkey was added to your Tonaris account");

  // Removed, it stops at once, and the page says why.
  await page.goto("/settings/account");
  await passkeys.getByRole("button", { name: "Remove Test laptop" }).click();
  await expect(passkeys.getByText("No passkeys yet.")).toBeVisible();
  await context.clearCookies();
  await signInWithPasskey(page);
  await expect(page.getByRole("alert")).toContainText("isn't on a Tonaris account anymore");
  await expect(page).toHaveURL(/\/sign-in/);
});
