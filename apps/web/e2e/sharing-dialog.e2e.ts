// The sharing dialog in a real browser (DS-65; FR-07.1–FR-07.4, FR-07.14, FR-11.3; AC-21, AC-38): disclosures before
// anything is shared, a display name added in place, invitations for members only with the typed address kept on a
// refusal, the link turned on, copied and turned off after a confirmation, access inherited from a folder above, and
// ⇧S.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts, nobody } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { insert, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const container = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
  description: null,
});
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

test("share a folder by invitation and link, then see it from a list inside", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, accounts.sharingDialog);
  await live(page);
  const metal = container("folder", "Metal");
  const doom = container("list", "Doom", metal.id);
  await insert(page, metal, doom);
  await saved(page);

  await page.goto(`/f/${metal.id}`);
  await live(page);
  await page.getByRole("button", { name: "Share" }).click();
  const share = dialog(page, `Share "Metal" · folder`);
  // The disclosures come first, before anything can be shared (FR-07.14).
  await expect(share).toContainText(
    "Viewers see every custom field these albums use, including ones you add later.",
  );
  await expect(share).toContainText(
    "Sharing a folder includes everything inside it, now and in the future.",
  );

  // Without a display name, sharing asks for one first (FR-11.3).
  await expect(share.getByRole("button", { name: "Invite" })).toHaveCount(0);
  await expect(share.getByRole("switch")).toHaveCount(0);
  await share.getByRole("textbox", { name: "Add a display name to share" }).fill("Denis");
  await share.getByRole("button", { name: "Save" }).click();

  // Only members can be invited; the typed address stays (FR-07.4).
  const email = share.getByRole("textbox", { name: "Invite by email" });
  await email.fill(nobody);
  await share.getByRole("button", { name: "Invite" }).click();
  await expect(share.getByRole("alert")).toHaveText(
    "No Tonaris account uses this email. Invitations only work for existing members — you can share a link instead.",
  );
  await expect(email).toHaveValue(nobody);
  await email.fill(accounts.creator);
  await share.getByRole("button", { name: "Invite" }).click();
  const people = share.getByRole("list", { name: "People with access" });
  await expect(people).toContainText(accounts.creator);
  await expect(people).toContainText("Pending");
  await expect(email).toHaveValue("");

  // The link, with what it means beside it.
  await expect(share).toContainText("Anyone with the link can view and forward it.");
  await share.getByRole("switch", { name: "Link sharing" }).click();
  const link = share.getByRole("textbox", { name: "Share link" });
  await expect(link).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  const url = await link.inputValue();
  await share.getByRole("button", { name: "Copy" }).click();
  await expect(share.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  expect(await violations(page, '[data-slot="dialog-content"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(share).toHaveCount(0);

  // ⇧S on the list inside: access inherited from the folder, and the folder's own dialog from there.
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await page.keyboard.press("Shift+S");
  const doomShare = dialog(page, `Share "Doom" · list`);
  await expect(doomShare).not.toContainText("Sharing a folder includes");
  const inherited = doomShare.getByRole("list", { name: "Access from folders above" });
  await expect(inherited).toContainText(`Also visible through "Metal": 1 person · link`);
  await inherited.getByRole("button", { name: `"Metal"` }).click();
  const metalAgain = dialog(page, `Share "Metal" · folder`);
  await expect(metalAgain.getByRole("textbox", { name: "Share link" })).toHaveValue(url);

  // Turning the link off asks first, then it is gone for good.
  await metalAgain.getByRole("switch", { name: "Link sharing" }).click();
  await expect(metalAgain).toContainText(
    "Turn off link? This link stops working permanently; turning it back on creates a new one.",
  );
  await metalAgain.getByRole("button", { name: "Turn off" }).click();
  await expect(metalAgain.getByRole("textbox", { name: "Share link" })).toHaveCount(0);
  await expect(metalAgain.getByRole("switch", { name: "Link sharing" })).not.toBeChecked();
});
