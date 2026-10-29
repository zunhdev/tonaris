// DS-110's mobile web on the phone profiles (TON-103; AC-42, Q-03): `iphone` (WebKit) and `pixel` (Chromium) run
// this file alone. A phone browses by drilling down: a top bar with Back, the name, Search and Account; the root's
// folders and lists, then Unsorted and Shared with me; 56 px album rows; an album in a read-only sheet with its
// links; view options in a bottom sheet; and Trash and custom fields left to the desktop.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import type { Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, list, live } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const spotify = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";

/** The folder Metal holding the list Doom, with Dopesmoker linked to Spotify; Holy Mountain in Unsorted. */
async function seeded(page: Page) {
  const metal: Container = { ...list("Metal"), kind: "folder" };
  const doom: Container = { ...list("Doom"), parentId: metal.id };
  const dopesmoker = album("Dopesmoker", { artistCredit: "Sleep", originalYear: 1999 });
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).isPersisted.promise;
    },
    [metal, doom],
  );
  await added(page, [dopesmoker], doom.id);
  await added(page, [album("Holy Mountain", { artistCredit: "Sleep", originalYear: 1992 })]);
  await page.evaluate(
    async (link) => {
      await window.tonarisSync?.links.insert(link).isPersisted.promise;
    },
    { albumId: dopesmoker.id, service: "spotify" as const, url: spotify },
  );
  return { metal, doom, dopesmoker };
}

/**
 * axe's findings on the page. Base UI's focus guards are left out: in Safari it gives the invisible sentinels that keep
 * focus inside a dialog `role="button"`, for VoiceOver, which axe reads as unnamed buttons (TON-93 checks them).
 */
const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .exclude("[data-base-ui-focus-guard]")
      .analyze()
  ).violations.map((violation) => violation.id);

test("a phone browses by drilling down, and opens an album in a sheet", async ({ page }) => {
  await signIn(page, accounts.phone);
  await live(page);
  await seeded(page);
  await page.goto("/c");
  await live(page);

  // No sidebar: the top bar has the name, Search and Account.
  await expect(page.getByRole("heading", { level: 1, name: "Collection" })).toBeVisible();
  await expect(page.getByRole("tree")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Account: / })).toBeVisible();
  const more = page.getByRole("navigation", { name: "More" });
  await expect(more.getByRole("link")).toHaveText([/Unsorted\s*1/, "Shared with me"]);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("link", { name: "Metal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Metal" })).toBeVisible();
  await page.getByRole("link", { name: "Doom" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Doom" })).toBeVisible();

  // A 56 px row with the artist under the title, and nothing wider than the screen.
  const row = page
    .getByRole("grid", { name: "Doom" })
    .getByRole("row")
    .filter({ hasText: "Dopesmoker" });
  await expect(row).toContainText("Sleep");
  expect((await row.boundingBox())?.height).toBe(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await axe(page)).toEqual([]);

  await row.getByText("Dopesmoker").click();
  const sheet = page.getByRole("complementary", { name: "Album" });
  await expect(sheet.getByRole("button", { name: "Close album" })).toBeFocused();
  await expect(sheet.getByRole("link", { name: /^Open in Spotify/ })).toHaveAttribute(
    "href",
    spotify,
  );
  // Read-only: nothing to edit on a phone.
  await expect(sheet.getByRole("button", { name: /^Edit|Replace|Remove/ })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
  await sheet.getByRole("button", { name: "Close album" }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByRole("button", { name: "Back to Metal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Metal" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Collection" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Collection" })).toBeVisible();
});

test("view options are a bottom sheet, and Trash and custom fields stay on the desktop", async ({
  page,
}) => {
  await signIn(page, accounts.phoneOptions);
  await live(page);
  await seeded(page);
  await page.goto("/unsorted");
  await live(page);

  await page.getByRole("button", { name: "View options" }).click();
  const options = page.getByRole("dialog", { name: "View options" });
  await expect(options).toBeVisible();
  // At the bottom of the screen, once its opening animation is over.
  const height = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await options.boundingBox();
      return box && Math.round(box.y + box.height);
    })
    .toBe(height);
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press("Escape");

  await page.goto("/trash");
  await expect(page.getByText("Trash is on the desktop app.")).toBeVisible();
  await page.goto("/settings/custom-fields");
  await expect(page.getByText("Setting up custom fields is on the desktop app.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Custom fields" }),
  ).toHaveCount(0);
});

test("search fills the screen and opens what it finds", async ({ page }) => {
  await signIn(page, accounts.phoneSearch);
  await live(page);
  await seeded(page);
  await page.goto("/c");
  await live(page);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Search" });
  await page.getByRole("combobox", { name: "Search" }).fill("doom");
  await palette.getByRole("option", { name: /Doom/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Doom" })).toBeVisible();
});
