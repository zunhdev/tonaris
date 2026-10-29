// Downloading your data in a real browser (DS-96, DS-97; FR-08.1, FR-08.6, FR-08.7; AC-41): Settings → Data says
// what's in the archive and what isn't, and the button downloads a dated ZIP, then offers it again; the
// account-deletion dialog offers the same download first.

import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, live, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

test("Settings → Data downloads the archive, then offers it again", async ({ page }) => {
  await signIn(page, accounts.exporter);
  await live(page);
  await added(page, [album("Dopesmoker", { artistCredit: "Sleep", originalYear: 1999 })]);

  await page.goto("/settings/data");
  const section = page.getByRole("region", { name: "Download your data" });
  await expect(section).toContainText("Every album, including Unsorted and Trash");
  await expect(section).toContainText("Your sign-in email and display name");

  const downloading = page.waitForEvent("download");
  await section.getByRole("button", { name: "Download your data" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^tonaris-export-\d{8}-\d{4}\.zip$/);
  const bytes = await readFile(await download.path());
  // A ZIP starts with a local file header, and keeps its entries' names readable.
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  for (const name of [
    "tonaris-export.json",
    "tonaris-export.schema.json",
    "collection.md",
    "README.md",
  ])
    expect(bytes.includes(name)).toBe(true);

  const again = section.getByRole("button", { name: "Download again" });
  await expect(again).toBeVisible();
  const repeated = page.waitForEvent("download");
  await again.click();
  expect((await repeated).suggestedFilename()).toBe(download.suggestedFilename());
  expect(await violations(page, "main")).toEqual([]);
});

test("the account-deletion dialog offers the download first", async ({ page }) => {
  await signIn(page, accounts.exportBeforeDeleting);
  await live(page);
  await page.goto("/settings/account");
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  const first = dialog.getByRole("region", { name: "Download your data first" });
  await expect(first).toBeVisible();
  const downloading = page.waitForEvent("download");
  await first.getByRole("button", { name: "Download your data" }).click();
  expect((await downloading).suggestedFilename()).toMatch(/^tonaris-export-\d{8}-\d{4}\.zip$/);
  await expect(dialog.getByRole("button", { name: "Delete account permanently" })).toBeDisabled();
});
