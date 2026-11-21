// Pictures for Help's Start here pages (TON-307, TON-308): the workspace, adding an album, opening it in a
// service, signing in, and a list on a phone.

import { test } from "@playwright/test";

import { idOf, ids, open, shot, visit } from "./support";

test("the workspace: a list as covers, with an album open in the panel", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}?album=${idOf(found, "Blue Hour Sessions")}`);
  await shot(page, "workspace");
});

test("Add album, empty", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}`);
  await page.getByRole("button", { name: "Add album" }).first().click();
  const dialog = page.getByRole("dialog");
  await shot(page, "add-album", { of: dialog });
});

test("Open in…, from an album's card", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}`);
  const card = page.getByRole("gridcell").filter({ hasText: "Field Notes" });
  await card.getByRole("button", { name: "Open 'Field Notes' in…" }).click();
  const chooser = page.getByRole("dialog", { name: "Open in…" });
  await shot(page, "open-in", { of: [card, chooser] });
});

test("signing in", async ({ browser }) => {
  const page = await open(browser, "guest");
  await page.goto("/sign-in");
  await shot(page, "sign-in", { of: page.getByRole("main"), pad: 32 });
});

test("a list on a phone", async ({ browser }) => {
  const page = await open(browser, "owner", "phone");
  await visit(page, "/c");
  const found = await ids(page);
  await visit(page, `/l/${idOf(found, "Late night")}`);
  await shot(page, "phone-list");
});

test("how to install, in Settings → Preferences", async ({ browser }) => {
  const page = await open(browser, "owner");
  await page.setViewportSize({ width: 1440, height: 1400 });
  await visit(page, "/settings/preferences");
  const app = page.getByRole("region", { name: "App" });
  await shot(page, "start-here-install-preferences", { of: app, pad: 16 });
});
