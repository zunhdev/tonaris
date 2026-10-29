// TS-106's XSS fixtures in a real browser (AC-45, Q-05; TON-95): hostile text saved as a list's name and
// description and as album titles shows as the text it is in the list, the album's details, search and the guest
// page, and none of it runs. Each fixture would set window.__tonarisPwned if it did.

import { expect, type Page, test } from "@playwright/test";

import { shareSettingsSchema, uuidv7 } from "@tonaris/domain";
import adversarial from "@tonaris/domain/fixtures/adversarial.json" with { type: "json" };

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, created, live, webOrigin } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const [name = "", description = "", ...titles] = adversarial.xss;

async function send(page: Page, mutation: string, args: Record<string, unknown>, base?: unknown) {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name: mutation, args, ...(base === undefined ? {} : { base }) },
  });
  expect((await response.json()).outcome.status).toBe("confirmed");
}

/** Whether any fixture ran on the page, or opened a dialog. */
async function watch(page: Page): Promise<() => Promise<boolean>> {
  let dialog = false;
  page.on("dialog", (opened) => {
    dialog = true;
    void opened.dismiss();
  });
  return async () => dialog || (await page.evaluate(() => "__tonarisPwned" in window));
}

test("hostile text shows as text everywhere it appears, and never runs", async ({
  page,
  browser,
}) => {
  const ran = await watch(page);
  await signIn(page, accounts.hostile);
  await live(page);
  const list = await created(page, name);
  await send(page, "container.describe", { id: list.id, description }, { description: null });
  const albums = titles.map((title) => album(title, { artistCredit: "Sleep" }));
  await added(page, albums, list.id);

  await page.goto(`/l/${list.id}`);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  for (const title of titles)
    // oxlint-disable-next-line no-await-in-loop -- one row at a time
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

  await page.goto(`/l/${list.id}?album=${albums[0]!.id}`);
  await expect(
    page.getByRole("complementary").getByText(titles[0]!, { exact: true }).first(),
  ).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("tonarisPwned");
  await expect(page.getByRole("option").filter({ hasText: titles[0]! }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await ran()).toBe(false);

  // The guest page renders the same text for anyone with the link.
  await send(page, "account.setDisplayName", { displayName: "Hostile" });
  await send(page, "share.setLink", { containerId: list.id, linkId: uuidv7(), enabled: true });
  const settings = shareSettingsSchema.parse(
    await (await page.request.get(`${apiUrl}/v1/containers/${list.id}/sharing`)).json(),
  );
  const guest = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  const guestRan = await watch(guest);
  await guest.goto(settings.link?.url ?? "");
  await expect(guest.getByRole("heading", { name, exact: true })).toBeVisible();
  for (const title of titles)
    // oxlint-disable-next-line no-await-in-loop
    await expect(guest.getByText(title, { exact: true }).first()).toBeVisible();
  expect(await guestRan()).toBe(false);
});
