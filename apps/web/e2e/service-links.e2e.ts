// Service links in a real browser (FR-06.2, FR-06.3; DS-46, DS-47): the inspector shows an album's links, each
// opening its page; in Editing mode it adds, replaces and removes them, refusing another service's link at the field,
// with Undo for a removal; and manual entry saves an album with its links, refusing a wrong one in its summary. Each
// test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, live, saved, toasts, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const inspector = (page: Page) => page.getByRole("complementary", { name: "Album" });
const links = (page: Page) => inspector(page).getByRole("region", { name: "Links" });
const bleach = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";

test("the inspector shows an album's links, and Editing mode adds, replaces and removes them", async ({
  page,
}) => {
  await signIn(page, accounts.linksInspector);
  await live(page);
  const grunge = await created(page, "Grunge");
  const record = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await added(page, [record], grunge.id);
  await page.evaluate(
    async ({ albumId, url }) => {
      await window.tonarisSync?.links.insert({ albumId, service: "spotify", url }).isPersisted
        .promise;
    },
    { albumId: record.id, url: bleach },
  );
  await page.goto(`/l/${grunge.id}?album=${record.id}`);
  await live(page);

  const open = links(page).getByRole("link", { name: "Open in Spotify" });
  await expect(open).toHaveAttribute("href", bleach);
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(links(page)).not.toContainText("Tidal");
  expect(await violations(page, "aside")).toEqual([]);

  await page.keyboard.press("e");
  // Another service's link is refused at the field, and nothing is sent.
  await links(page).getByRole("button", { name: "Add Tidal link" }).click();
  const tidal = links(page).getByRole("textbox", { name: "Tidal link" });
  await tidal.fill(bleach);
  await tidal.press("Enter");
  await expect(links(page)).toContainText("This is a Spotify link. Paste a Tidal link here.");
  await tidal.fill("https://listen.tidal.com/album/1663133?u");
  await tidal.press("Enter");
  // The stream brings the canonical URL.
  await expect(links(page).getByRole("link", { name: "Open in Tidal" })).toHaveAttribute(
    "href",
    "https://tidal.com/album/1663133",
  );

  await links(page).getByRole("button", { name: "Replace the Spotify link" }).click();
  const spotify = links(page).getByRole("textbox", { name: "Spotify link" });
  await expect(spotify).toHaveValue(bleach);
  await spotify.fill("https://open.spotify.com/intl-de/album/6jD6Wl5TgtrC8GJkplOtW9?si=abc");
  await spotify.press("Enter");
  await expect(links(page).getByRole("link", { name: "Open in Spotify" })).toHaveAttribute(
    "href",
    "https://open.spotify.com/album/6jD6Wl5TgtrC8GJkplOtW9",
  );

  await links(page).getByRole("button", { name: "Remove the Tidal link" }).click();
  await expect(links(page).getByRole("link", { name: "Open in Tidal" })).toHaveCount(0);
  const undo = toasts(page).filter({ hasText: "Removed the Tidal link" });
  await undo.getByRole("button", { name: "Undo" }).click();
  await expect(links(page).getByRole("link", { name: "Open in Tidal" })).toBeVisible();
  await saved(page);

  await page.reload();
  await live(page);
  await expect(links(page).getByRole("link", { name: "Open in Spotify" })).toHaveAttribute(
    "href",
    "https://open.spotify.com/album/6jD6Wl5TgtrC8GJkplOtW9",
  );
  await expect(links(page).getByRole("link", { name: "Open in Tidal" })).toBeVisible();
});

test("manual entry saves an album with its links, and refuses another service's link", async ({
  page,
}) => {
  await signIn(page, accounts.linksEntry);
  await live(page);
  const grunge = await created(page, "Grunge");
  await page.goto(`/l/${grunge.id}`);
  await live(page);

  await page.getByRole("main").getByRole("button", { name: "Add album" }).click();
  const form = page.getByRole("dialog", { name: "New album" });
  await form.getByRole("textbox", { name: "Title" }).fill("Bleach");
  await form.getByRole("textbox", { name: "Artist" }).fill("Nirvana");
  await form.getByRole("textbox", { name: "Original release year" }).fill("1989");
  const appleField = form.getByRole("textbox", { name: "Apple Music link" });
  await appleField.fill(bleach);
  // Leaving the field shows its problem.
  await appleField.press("Tab");
  await expect(form).toContainText("This is a Spotify link. Paste an Apple Music link here.");
  await form.getByRole("button", { name: "Add album" }).click();
  await expect(form.getByRole("alert")).toContainText("Check 1 field: Apple Music link.");

  await appleField.fill("");
  await form.getByRole("textbox", { name: "Spotify link" }).fill(`${bleach}?si=abc`);
  await form.getByRole("button", { name: "Add album" }).click();
  await expect(form).toHaveCount(0);
  await saved(page);

  await page
    .getByRole("grid", { name: "Grunge" })
    .getByRole("row")
    .filter({ hasText: "Bleach" })
    .getByRole("gridcell")
    .first()
    .click();
  await expect(links(page).getByRole("link", { name: "Open in Spotify" })).toHaveAttribute(
    "href",
    bleach,
  );
});
