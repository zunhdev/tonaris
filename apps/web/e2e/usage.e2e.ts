// Settings → Data's usage meter in a real browser (DS-98; FR-15.2, FR-15.3; AC-32): albums count whether active or
// in Trash, and the meter says how many of each against the 5,000 limit.

import { expect, test } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

test("the meter counts active albums and albums in Trash", async ({ page }) => {
  await signIn(page, accounts.usage);
  await live(page);
  const [dopesmoker, holy] = [
    album("Dopesmoker", { artistCredit: "Sleep", originalYear: 1999 }),
    album("Holy Mountain", { artistCredit: "Sleep", originalYear: 1992 }),
  ];
  await added(page, [dopesmoker, holy]);
  await page.evaluate(async (id) => {
    await window.tonarisSync?.trash.deleteAlbum(id).transaction.isPersisted.promise;
  }, holy.id);
  await saved(page);

  await page.goto("/settings/data");
  await live(page);
  await expect(
    page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Data" }),
  ).toHaveAttribute("aria-current", "page");
  const usage = page.getByRole("region", { name: "Usage" });
  await expect(usage).toContainText("2 of 5,000 albums · 1 in Trash");
  await expect(usage.getByRole("meter", { name: "Albums used" })).toHaveAttribute("value", "2");
  expect(await violations(page, "main")).toEqual([]);
});
