// accounts spec, Settings → Profile (FR-11.3, FR-11.16, DS-93, AC-38): the display name, saved when the field loses
// focus, shown in the account menu, optional while nothing is shared, and kept when clearing it while sharing; the
// avatar's color and the About text (TON-296); favorite albums, found by typing, moved and removed (TON-297).

import { uuidv7 } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, type Page, test } from "./support/test";
import { added, album, created, live, violations, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

/** Sends a mutation as the page's account, as the sharing dialog does. */
async function send(page: Page, name: string, args: Record<string, unknown>) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name, args },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).outcome.status).toBe("confirmed");
}

async function openProfile(page: Page) {
  await page.goto("/settings/preferences");
  await page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("link", { name: "Profile" })
    .click();
  await expect(page).toHaveURL("/settings/profile");
  await expect(
    page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Profile" }),
  ).toHaveAttribute("aria-current", "page");
}

const field = (page: Page) => page.getByRole("textbox", { name: "Display name" });
/** The display name's own "Saved.", apart from the About text's. */
const nameStatus = (page: Page) =>
  page
    .getByRole("main")
    .locator("form")
    .filter({ has: field(page) })
    .getByRole("status");

test("the display name saves on blur, shows in the account menu, and clears while nothing is shared", async ({
  page,
}) => {
  const email = accounts.profileName;
  await signIn(page, email);
  await openProfile(page);
  await expect(field(page)).toHaveValue("");

  await field(page).fill("Mira");
  await field(page).press("Tab");
  await expect(nameStatus(page)).toHaveText("Saved.");
  await expect(page.getByRole("button", { name: "Account: Mira" })).toBeVisible();
  expect(await violations(page, "main")).toEqual([]);
  await page.reload();
  await expect(field(page)).toHaveValue("Mira");

  // Optional while nothing is shared.
  await field(page).fill("");
  await field(page).press("Enter");
  await expect(nameStatus(page)).toHaveText("Saved.");
  await expect(page.getByRole("button", { name: `Account: ${email}` })).toBeVisible();
});

test("clearing the name while sharing is refused, and the saved name stays", async ({ page }) => {
  await signIn(page, accounts.profileGuard);
  await live(page);
  const doom = await created(page, "Doom");
  await send(page, "account.setDisplayName", { displayName: "Pat" });
  await send(page, "share.setLink", { containerId: doom.id, linkId: uuidv7(), enabled: true });

  await openProfile(page);
  await expect(field(page)).toHaveValue("Pat");
  await field(page).fill("");
  await field(page).press("Tab");
  await expect(page.getByRole("alert")).toHaveText(
    "People you share with see your display name. Stop sharing to clear it.",
  );
  await expect(field(page)).toHaveValue("Pat");
  await page.reload();
  await expect(field(page)).toHaveValue("Pat");
  await expect(page.getByRole("button", { name: "Account: Pat" })).toBeVisible();
});

test("the avatar's color saves on choice and shows in the account menu; the About text saves on blur", async ({
  page,
}) => {
  await signIn(page, accounts.profileColor);
  await live(page);
  await send(page, "account.setDisplayName", { displayName: "Mira" });
  await openProfile(page);
  const colors = page.getByRole("group", { name: "Avatar color" });
  await expect(colors.getByRole("radio", { name: "Automatic" })).toBeChecked();
  // A swatch is picked by clicking it, its label.
  await colors.getByTitle("Blue").click();
  await expect(colors.getByRole("radio", { name: "Blue" })).toBeChecked();
  const menuAvatar = page
    .getByRole("button", { name: "Account: Mira" })
    .locator('[data-slot="avatar"]');
  const background = () =>
    menuAvatar
      .first()
      .evaluate((element) => (element instanceof HTMLElement ? element.style.background : ""));
  await expect.poll(background).toContain("270");

  const about = page.getByRole("textbox", { name: "About" });
  await about.fill("Doom and   sludge, mostly on vinyl.");
  await about.press("Tab");
  await expect(
    page.getByRole("main").locator("form").filter({ has: about }).getByRole("status"),
  ).toHaveText("Saved.");
  expect(await violations(page, "main")).toEqual([]);
  await page.reload();
  await expect(about).toHaveValue("Doom and sludge, mostly on vinyl.");
  await expect(page.getByRole("radio", { name: "Blue" })).toBeChecked();
});

test("favorite albums are found by typing, moved, removed, and four at most", async ({ page }) => {
  await signIn(page, accounts.profileFavorites);
  await live(page);
  const titles = ["Nightfall", "Dopesmoker", "Homogenic", "Spiderland", "Remain in Light"];
  await added(
    page,
    titles.map((title) => album(title, { artistCredit: `${title} band` })),
  );
  await openProfile(page);
  const favorites = page.getByRole("list", { name: "Favorite albums" }).getByRole("listitem");

  async function pick(typed: string, title: string) {
    await page.getByRole("button", { name: "Add a favorite…" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a favorite album" });
    await expect(dialog).toContainText("Type a title or artist.");
    await dialog.getByRole("combobox", { name: "Find an album" }).fill(typed);
    await dialog.getByRole("option", { name: new RegExp(title) }).click();
    // Gone from the page, past its closing animation, before the next (TON-102's lesson).
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
    await expect(favorites.filter({ hasText: title })).toHaveCount(1);
  }
  await pick("night", "Nightfall");
  await pick("dope", "Dopesmoker");
  await expect(favorites).toHaveText([/Nightfall/, /Dopesmoker/]);
  expect(await violations(page, "main")).toEqual([]);

  await page.getByRole("button", { name: "Move Dopesmoker up" }).click();
  await expect(favorites).toHaveText([/Dopesmoker/, /Nightfall/]);
  await page.getByRole("button", { name: "Remove Nightfall" }).click();
  await expect(favorites).toHaveText([/Dopesmoker/]);

  // Four at most: then nothing more to add.
  await pick("homo", "Homogenic");
  await pick("spider", "Spiderland");
  await pick("remain", "Remain in Light");
  await expect(favorites).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Add a favorite…" })).toHaveCount(0);
  await page.reload();
  await expect(favorites).toHaveText([/Dopesmoker/, /Homogenic/, /Spiderland/, /Remain in Light/]);
});
