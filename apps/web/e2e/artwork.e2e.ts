// Artwork in a real browser (FR-03.4, Q-05; DS-23, TS-103): albums show their artwork through the API's image proxy,
// never from the artwork's own host, under the page's strict CSP; artwork that fails keeps the fallback tile, as an
// album without artwork has; and the inspector edits an album's artwork URL, refusing one that isn't an https link.
// Find artwork offers the Cover Art Archive's covers in the inspector and the manual entry form (TON-112). The
// browser-test API's image host and covers are stubs (`fixtureImageFetch`, `fixtureCovers`). Each test signs in
// with its own account.

import { expect, test, type Page } from "@playwright/test";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, live, saved, violations } from "./support/workspace";

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

test("Find artwork in the inspector offers covers, and saves the one chosen", async ({ page }) => {
  await signIn(page, accounts.artworkFound);
  await live(page);
  const thrash = await created(page, "Thrash");
  const record = album("Kill 'Em All", { artistCredit: "Metallica", originalYear: 1983 });
  await added(page, [record], thrash.id);
  await page.goto(`/l/${thrash.id}?album=${record.id}`);
  await live(page);
  await page.keyboard.press("e");

  await inspector(page).getByRole("button", { name: "Find artwork" }).click();
  const covers = page.getByRole("list", { name: "Covers" });
  await expect(covers.getByRole("button")).toHaveCount(2);
  await expect(covers.locator("img").first()).toHaveAttribute(
    "src",
    new RegExp(`^${apiUrl}/img/[\\w-]{22}/[\\w-]+$`),
  );
  expect(await violations(page, '[data-slot="popover-content"]')).toEqual([]);

  await expect(covers.getByRole("button").first()).toHaveAccessibleName(
    "Kill ’Em All 1983 · Album",
  );
  await covers.getByRole("button", { name: /^Kill ’Em All 1983/ }).click();
  await expect(covers).toHaveCount(0);
  await saved(page);
  await expect(inspector(page).getByRole("textbox", { name: "Artwork URL" })).toHaveValue(
    "https://images.example/kill-em-all.png",
  );
  await expect(rowOf(page, "Thrash", "Kill 'Em All").locator("img")).toHaveAttribute(
    "src",
    new RegExp(`^${apiUrl}/img/`),
  );
});

test("Find artwork in the manual entry form fills the Artwork URL, and says what it can't find", async ({
  page,
}) => {
  await signIn(page, accounts.artworkFoundForm);
  await live(page);
  await page.goto("/c");
  await live(page);
  await page.getByRole("button", { name: "Add album" }).click();
  await page
    .getByRole("dialog", { name: "Add albums" })
    .getByRole("button", { name: "Enter manually" })
    .click();
  const form = page.getByRole("dialog", { name: "New album" });
  const find = form.getByRole("button", { name: "Find artwork" });
  const covers = page.getByRole("list", { name: "Covers" });

  // It waits for a title and an artist.
  await expect(find).toHaveAttribute("aria-disabled", "true");
  await form.getByRole("textbox", { name: "Title" }).fill("Kill 'Em All");
  await form.getByRole("textbox", { name: "Artist" }).fill("Metallica");
  await find.click();
  await covers.getByRole("button", { name: /^Kill ’Em All for One/ }).click();
  await expect(covers).toHaveCount(0);
  await expect(form.getByRole("textbox", { name: "Artwork URL" })).toHaveValue(
    "https://images.example/kill-em-all-for-one.png",
  );

  await form.getByRole("textbox", { name: "Artist" }).fill("Nobody Known");
  await find.click();
  await expect(page.getByText("No covers found.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("No covers found.")).toHaveCount(0);
  await expect(form).toBeVisible();

  await form.getByRole("textbox", { name: "Artist" }).fill("Down");
  await find.click();
  await expect(page.getByRole("alert")).toContainText("Couldn't reach MusicBrainz. Try again.");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
