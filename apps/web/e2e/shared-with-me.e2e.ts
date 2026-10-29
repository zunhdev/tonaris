// Shared with me in a real browser (DS-67, DS-68; FR-07.7, FR-07.13; AC-24): opening a link adds nothing; the banner
// adds it on purpose; another tab of the person's shows it without reloading; an invitation-based share is left after
// a confirmation; and one whose link was turned off is dimmed and removed.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { insert, live, saved, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (kind: Container["kind"], name: string): Container => ({
  id: uuidv7(),
  kind,
  parentId: null,
  name,
  description: null,
});

async function send(page: Page, name: string, args: Record<string, unknown>) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name, args },
  });
  const body = await response.json();
  expect(body.outcome?.status, JSON.stringify(body)).toBe("confirmed");
  return body.outcome;
}

async function signedIn(browser: Browser, address: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, address);
  await live(page);
  return page;
}

test("links are added on purpose, sync to another tab, and leave or go when they stop working", async ({
  page,
  browser,
}) => {
  await signIn(page, accounts.sharingOwner);
  await live(page);
  const [doom, metal] = [container("list", "Doom"), container("folder", "Metal")];
  await insert(page, doom, metal);
  await saved(page);
  await send(page, "account.setDisplayName", { displayName: "Denis" });
  await send(page, "share.setLink", { containerId: doom.id, linkId: uuidv7(), enabled: true });
  const settings = await (
    await page.request.get(`${apiUrl}/v1/containers/${doom.id}/sharing`)
  ).json();
  const linkPath = new URL(settings.link.url).pathname;
  const grantId = uuidv7();
  await send(page, "share.invite", {
    grantId,
    containerId: metal.id,
    email: accounts.sharingViewer,
  });

  const viewer = await signedIn(browser, accounts.sharingViewer);
  // Opening a link adds nothing (FR-07.13).
  await viewer.goto(linkPath);
  const banner = viewer.getByRole("button", { name: "Add to Shared with me" });
  await expect(banner).toBeVisible();
  const other = await viewer.context().newPage();
  await other.goto("/shared");
  await live(other);
  await expect(other.getByRole("main")).toContainText("Nothing is shared with you yet.");

  // The banner adds it; the other tab shows it without reloading.
  await banner.click();
  await expect(viewer.getByRole("link", { name: "In Shared with me" })).toBeVisible();
  const byDenis = other.getByRole("region", { name: "Shared by Denis" });
  await expect(byDenis).toContainText(`"Doom"`);
  await expect(byDenis).toContainText("List · from a link");

  // An accepted invitation is left after a confirmation (FR-07.7).
  await send(viewer, "share.accept", { grantId });
  await other.reload();
  await live(other);
  const metalRow = byDenis.getByRole("listitem").filter({ hasText: `"Metal"` });
  await expect(metalRow).toContainText("Folder · by invitation");
  expect(await violations(other, "main")).toEqual([]);
  await metalRow.getByRole("button", { name: "Leave share…" }).click();
  await expect(metalRow).toContainText(`Leave "Metal"? Denis would have to invite you again.`);
  await metalRow.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(byDenis.getByRole("listitem")).toHaveCount(1);

  // The owner turns the link off: dimmed, and removable (FR-07.13).
  await send(page, "share.setLink", { containerId: doom.id, linkId: uuidv7(), enabled: false });
  await other.reload();
  await live(other);
  const gone = byDenis.getByRole("listitem");
  await expect(gone).toContainText("No longer available");
  await expect(gone).not.toContainText("Doom");
  await gone.getByRole("button", { name: "Remove" }).click();
  await expect(other.getByRole("main")).toContainText("Nothing is shared with you yet.");
});
