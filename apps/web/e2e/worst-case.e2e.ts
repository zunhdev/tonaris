// Worst-case text at every width (DRIFT-025): the break-ui catalog's longest and least Latin names and titles
// (.claude/skills/break-ui/catalog.md), at 1440, 412 and 320 px, on the list, the album panel and sheet, the album
// panel's edit mode, the Add albums dialog and the account menu. Text must stay inside its boxes, be cut off only with
// an ellipsis, and never overlap other text (support/text-fit.ts). Each of these broke once and was found by hand
// (TON-152, TON-156, TON-165, TON-180).

import { expect, type Page, test } from "@playwright/test";

import { maxAlbumTextLength, maxNameLength, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { textProblems } from "./support/text-fit";
import { added, album, list, live, pageFaded } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

/** `text` repeated to exactly `length` code points, as the domain's limits count them (limits.ts). */
const filled = (text: string, length: number) => {
  const points = Array.from(text);
  return Array.from(text.repeat(Math.ceil(length / points.length)))
    .slice(0, length)
    .join("");
};

const folderName = filled(
  "Best of 2026 — vinyl only (to buy at Rough Trade, ask about the Japanese pressings) ",
  maxNameLength,
);
const listName = filled("Мумий Тролль, Βαγγέλης и Ágætis byrjun ", maxNameLength);
const classical =
  "Berliner Philharmoniker, Herbert von Karajan, Wiener Singverein, Gundula Janowitz, Hilde Rössel-Majdan, Waldemar Kmentt, Walter Berry";
const longest = album(
  filled(
    'Symphony No. 9 in D minor, Op. 125 "Choral": IV. Presto – Allegro assai – Andante maestoso – ',
    maxAlbumTextLength,
  ),
  { artistCredit: classical, originalYear: 1963 },
);
const others = [
  album("Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(3), { artistCredit: "!!!" }),
  album(filled("坂本龍一", 60), { artistCredit: "坂本龍一" }),
  album("ثلاثية", { artistCredit: "Ólafur Arnalds & Nils Frahm" }),
  album("I", { artistCredit: "Sigur Rós", originalYear: 2002 }),
];
const links = [
  ["spotify", "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv"],
  ["apple-music", "https://music.apple.com/us/album/nevermind/1440783617"],
  ["qobuz", "https://open.qobuz.com/album/0060253780880"],
  ["tidal", "https://tidal.com/album/77654321"],
  [
    "youtube-music",
    "https://music.youtube.com/playlist?list=OLAK5uy_000000000000000000000000000000001",
  ],
] as const;

/** The folder and list with the longest names, holding the albums; every service link on the longest one. */
async function seeded(page: Page): Promise<Container> {
  const folder: Container = { ...list(folderName), kind: "folder" };
  const inside: Container = { ...list(listName), parentId: folder.id };
  await page.evaluate(
    async (containers) => {
      await window.tonarisSync?.containers.insert(containers).when("settled");
    },
    [folder, inside],
  );
  await added(page, [longest, ...others], inside.id);
  await page.evaluate(
    async (each) => {
      await window.tonarisSync?.links.insert(each).when("settled");
    },
    links.map(([service, url]) => ({ albumId: longest.id, service, url })),
  );
  return inside;
}

/** The page once it has settled: no fade or opening animation still moving text. */
async function settled(page: Page) {
  await pageFaded(page);
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((each) => each.finished)),
  );
}

async function expectFits(page: Page, where: string) {
  await settled(page);
  expect(await textProblems(page), where).toEqual([]);
}

test("the longest names and titles fit at 1440, 412 and 320 px", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, accounts.worstCase);
  await live(page);
  const doom = await seeded(page);

  for (const width of [1440, 412, 320]) {
    const at = `${width} px`;
    // oxlint-disable-next-line no-await-in-loop
    await page.setViewportSize({ width, height: 900 });
    // oxlint-disable-next-line no-await-in-loop
    await page.goto(`/l/${doom.id}`);
    // oxlint-disable-next-line no-await-in-loop
    await live(page);
    // oxlint-disable-next-line no-await-in-loop
    await expectFits(page, `the list, ${at}`);

    // oxlint-disable-next-line no-await-in-loop
    await page.goto(`/l/${doom.id}?album=${longest.id}`);
    // oxlint-disable-next-line no-await-in-loop
    await live(page);
    // oxlint-disable-next-line no-await-in-loop
    await expectFits(page, `the album, ${at}`);

    if (width === 1440) {
      // The release types' segments (TON-165), in the panel's edit mode.
      // oxlint-disable-next-line no-await-in-loop
      await page.keyboard.press("e");
      // oxlint-disable-next-line no-await-in-loop
      await expect(page.getByRole("radiogroup", { name: "Release type" })).toBeVisible();
      // oxlint-disable-next-line no-await-in-loop
      await expectFits(page, `the album's edit mode, ${at}`);

      // Adding albums to the long-named list (TON-180).
      // oxlint-disable-next-line no-await-in-loop
      await page.goto(`/l/${doom.id}`);
      // oxlint-disable-next-line no-await-in-loop
      await live(page);
      // oxlint-disable-next-line no-await-in-loop
      await page.getByRole("main").getByRole("button", { name: "Add album" }).click();
      const dialog = page.getByRole("dialog", { name: "Add albums" });
      // oxlint-disable-next-line no-await-in-loop
      await expect(dialog).toBeVisible();
      // oxlint-disable-next-line no-await-in-loop
      await expectFits(page, `the Add albums dialog, ${at}`);
      // oxlint-disable-next-line no-await-in-loop
      await page.keyboard.press("Escape");
      // oxlint-disable-next-line no-await-in-loop
      await expect(dialog).toHaveCount(0);
    }

    // The account menu (TON-152).
    // oxlint-disable-next-line no-await-in-loop
    await page.getByRole("button", { name: /^Account: / }).click();
    const menu = page.getByRole("menu");
    // oxlint-disable-next-line no-await-in-loop
    await expect(menu).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop
    await expectFits(page, `the account menu, ${at}`);
    // oxlint-disable-next-line no-await-in-loop
    await page.keyboard.press("Escape");
    // oxlint-disable-next-line no-await-in-loop
    await expect(menu).toHaveCount(0);
  }
});
