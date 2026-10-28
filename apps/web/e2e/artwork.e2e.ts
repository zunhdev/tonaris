// Artwork in a real browser (FR-03.4, Q-05; DS-23, TS-103): albums show their artwork through the API's image proxy,
// never from the artwork's own host, under the page's strict CSP; artwork that fails keeps the fallback tile, as an
// album without artwork has; and the inspector edits an album's artwork URL, refusing one that isn't an https link.
// The browser-test API's image host is a stub (`fixtureImageFetch`). Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, live, saved } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const rowOf = (page: Page, gridName: string, text: string) =>
  page.getByRole("grid", { name: gridName }).getByRole("row").filter({ hasText: text });
const inspector = (page: Page) => page.getByRole("complementary", { name: "Album" });

test("artwork shows through the image proxy, and a failed one keeps the tile", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await signIn(page, accounts.artworkShown);
  await live(page);
  const grunge = await created(page, "Grunge");
  const bleach = album("Bleach", { artworkUrl: "https://images.example/bleach.png" });
  const missing = album("Moth", { artworkUrl: "https://images.example/missing.png" });
  await added(page, [bleach, missing, album("Nevermind")], grunge.id);
  await page.goto(`/l/${grunge.id}`);
  await live(page);

  const image = rowOf(page, "Grunge", "Bleach").locator("img");
  await expect(image).toHaveAttribute("src", new RegExp(`^${apiUrl}/img/[\\w-]{22}/[\\w-]+$`));
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(1);
  // A failed load leaves the tile, never an error; an album without artwork has the tile only.
  await expect(rowOf(page, "Grunge", "Moth").locator("img")).toHaveCount(0);
  await expect(rowOf(page, "Grunge", "Moth")).toContainText("M");
  await expect(rowOf(page, "Grunge", "Nevermind").locator("img")).toHaveCount(0);

  // The inspector names it.
  await rowOf(page, "Grunge", "Bleach").getByRole("gridcell").first().click();
  await expect(inspector(page).getByRole("img", { name: "Cover of Bleach" })).toBeVisible();

  // The artwork's own host is never contacted from the browser.
  expect(requested.filter((url) => url.includes("images.example"))).toEqual([]);
});

test("the inspector edits the artwork URL, refusing one that isn't https", async ({ page }) => {
  await signIn(page, accounts.artworkEdited);
  await live(page);
  const grunge = await created(page, "Grunge");
  const record = album("In Utero");
  await added(page, [record], grunge.id);
  await page.goto(`/l/${grunge.id}?album=${record.id}`);
  await live(page);
  await page.keyboard.press("e");

  const field = inspector(page).getByRole("textbox", { name: "Artwork URL" });
  await field.fill("http://images.example/in-utero.png");
  await field.press("Enter");
  await expect(inspector(page)).toContainText(
    "Give the artwork as an https link, such as https://example.com/cover.jpg.",
  );
  await field.fill("https://images.example/in-utero.png");
  await field.press("Enter");
  await saved(page);
  await expect(rowOf(page, "Grunge", "In Utero").locator("img")).toHaveAttribute(
    "src",
    new RegExp(`^${apiUrl}/img/`),
  );
});
