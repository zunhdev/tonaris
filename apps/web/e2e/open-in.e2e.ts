// Opening a service (AC-18; FR-06.5, FR-06.6; DS-21, DS-25, TS-43): the "Open in…" chooser lists only an album's
// services, in order, every time; on desktop each opens its page in a new tab, with its app beside it and a hedged
// message when the app doesn't take the focus; `O` opens it from the keyboard, or says an album has no links; and on
// a phone-sized touch screen it is a bottom sheet of the canonical links. Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { streamingServices, type Album, type StreamingService } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, live, toasts } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const spotify = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";
const tidal = "https://tidal.com/album/77654321";
const apple = "https://music.apple.com/us/album/1440783617";

/** An album in the list `name`, with links to these services. */
async function linked(
  page: Page,
  name: string,
  record: Album,
  urls: Partial<Record<StreamingService, string>>,
) {
  const list = await created(page, name);
  await added(page, [record], list.id);
  const rows = streamingServices.flatMap((service) => {
    const url = urls[service];
    return url === undefined ? [] : [{ albumId: record.id, service, url }];
  });
  await page.evaluate(async (links) => {
    const sync = window.tonarisSync;
    if (!sync) throw new Error("No sync client on the page.");
    await sync.links.insert(links).isPersisted.promise;
  }, rows);
  await page.goto(`/l/${list.id}`);
  await live(page);
}

const rowOf = (page: Page, gridName: string, text: string) =>
  page.getByRole("grid", { name: gridName }).getByRole("row").filter({ hasText: text });

test("on desktop, the chooser lists only the album's services, each opening its page or its app", async ({
  page,
}) => {
  await signIn(page, accounts.openDesktop);
  await live(page);
  const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
  await linked(page, "Grunge", bleach, { tidal, spotify });

  const row = rowOf(page, "Grunge", "Bleach");
  await expect(row).toContainText("Spotify, Tidal");
  await row.hover();
  await row.getByRole("button", { name: "Open 'Bleach' in…" }).click();
  const chooser = page.getByRole("dialog", { name: "Open in…" });
  // The services' own choices, not their apps'.
  const choices = chooser.getByRole("link", { name: /^Open in (?!the )/ });
  await expect(choices).toHaveText(["Open in Spotify", "Open in Tidal"]);
  await expect(choices.first()).toBeFocused();
  await expect(choices.first()).toHaveAttribute("href", spotify);
  await expect(choices.first()).toHaveAttribute("target", "_blank");
  await expect(chooser.getByRole("link", { name: "Open in the Spotify app" })).toHaveAttribute(
    "href",
    "spotify:album:1KQ1Pf4ikoK1jBbOtOHvOv",
  );
  await expect(chooser.getByRole("link", { name: "Open in the Tidal app" })).toHaveAttribute(
    "href",
    "tidal://album/77654321",
  );
  // The inspector didn't open: Open is the row's own action.
  await expect(page.getByRole("complementary", { name: "Album" })).toHaveCount(0);

  // No app takes the focus here, so after 2 s the chooser says so, and offers the same service's page only.
  await page.bringToFront();
  await chooser.getByRole("link", { name: "Open in the Tidal app" }).click();
  await expect(chooser).toContainText(
    "If the Tidal app didn't open, it may not be installed on this computer.",
    { timeout: 5_000 },
  );
  await expect(chooser.getByRole("link")).toHaveCount(1);
  await expect(chooser.getByRole("link", { name: "Open Tidal on the web" })).toHaveAttribute(
    "href",
    tidal,
  );
});

test("O opens the chooser for the focused album, a single link still asks, and an album without links says so", async ({
  page,
}) => {
  await signIn(page, accounts.openKeys);
  await live(page);
  const nevermind = album("Nevermind", { artistCredit: "Nirvana", originalYear: 1991 });
  await linked(page, "Grunge", nevermind, { "apple-music": apple });
  await added(page, [album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 })]);
  const list = page.getByRole("grid", { name: "Grunge" });

  await rowOf(page, "Grunge", "Nevermind").getByRole("gridcell").nth(1).focus();
  await page.keyboard.press("o");
  const chooser = page.getByRole("dialog", { name: "Open in…" });
  await expect(chooser.getByRole("link", { name: /^Open in (?!the )/ })).toHaveText([
    "Open in Apple Music",
  ]);
  await expect(chooser.getByRole("link", { name: "Open in the Apple Music app" })).toHaveAttribute(
    "href",
    "music://music.apple.com/us/album/1440783617",
  );
  await page.keyboard.press("Escape");
  await expect(chooser).toHaveCount(0);

  await page.goto("/unsorted");
  await live(page);
  await page
    .getByRole("grid", { name: "Unsorted" })
    .getByRole("row")
    .filter({ hasText: "Bleach" })
    .getByRole("gridcell")
    .nth(1)
    .focus();
  await page.keyboard.press("o");
  await expect(toasts(page).filter({ hasText: "'Bleach' has no links to open." })).toBeVisible();
  await expect(chooser).toHaveCount(0);
  await expect(list).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the chooser is a bottom sheet of the canonical links, without app links", async ({
    page,
  }) => {
    await signIn(page, accounts.openMobile);
    await live(page);
    const bleach = album("Bleach", { artistCredit: "Nirvana", originalYear: 1989 });
    await linked(page, "Grunge", bleach, { spotify, tidal });

    await rowOf(page, "Grunge", "Bleach").getByRole("button", { name: "Open 'Bleach' in…" }).tap();
    const sheet = page.getByRole("dialog", { name: "Open in…" });
    await expect(sheet.getByRole("link")).toHaveText(["Open in Spotify", "Open in Tidal"]);
    await expect(sheet.getByRole("link", { name: "Open in Tidal" })).toHaveAttribute("href", tidal);
    await expect(sheet.getByRole("link", { name: /app$/ })).toHaveCount(0);
    // It sits at the bottom of the screen.
    const box = await sheet.boundingBox();
    expect(box && box.y + box.height).toBeGreaterThan(830);
    expect(box && box.y).toBeGreaterThan(422);
  });
});
