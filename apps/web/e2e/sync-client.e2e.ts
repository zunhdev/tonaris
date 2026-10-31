// The sync client in a real browser (TS-22–TS-24): what Bun can't run, namely IndexedDB, Web Locks and the
// BroadcastChannel between tabs, and a page reloaded mid-write. The production build exposes its client to these
// tests (`TEST_HOOKS`), which drive its collections as the UI will. Each test signs in with its own account.

import { expect, type BrowserContext, type Page, test } from "@playwright/test";

import {
  accountSchema,
  bootstrapSchema,
  mutationSchema,
  uuidv7,
  type Album,
  type Container,
} from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";

test.use({ storageState: { cookies: [], origins: [] } });

const webOrigin = "http://localhost:3100";

const album = (title: string): Album => ({
  id: uuidv7(),
  title,
  artistCredit: "Miles Davis",
  releaseType: "album",
  isLive: false,
  originalYear: 1959,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
});

/** Waits until the page's sync client is connected, through its own stream or the leader's. */
async function live(page: Page): Promise<void> {
  await page.waitForFunction(() => window.tonarisSync?.engine.status === "live");
}

/** The account's data as the API has it. */
async function saved(page: Page) {
  const response = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
  expect(response.status()).toBe(200);
  return bootstrapSchema.parse(await response.json());
}

/** A write's save state in the page. */
const stateOf = (page: Page, mutationId: string) =>
  page.evaluate((id) => window.tonarisSync?.states.get(id)?.status, mutationId);

/** Counts the stream connections the context's pages open. */
function countStreams(context: BrowserContext) {
  let opened = 0;
  context.on("request", (request) => {
    if (request.url().includes("/v1/sync/stream")) opened += 1;
  });
  return () => opened;
}

test("a write the server saved, whose answer was lost, is sent again after a reload and saved once", async ({
  page,
}) => {
  await signIn(page, accounts.syncReload);
  await live(page);

  // The server saves the album, but the page never hears back before it reloads.
  const reached = Promise.withResolvers<string>();
  await page.route(`${apiUrl}/v1/mutations`, async (route) => {
    await route.fetch();
    reached.resolve(mutationSchema.parse(route.request().postDataJSON()).mutationId);
  });
  const args = album("Kind of Blue");
  await page.evaluate((value) => {
    window.tonarisSync?.albums.insert(value).isPersisted.promise.catch(() => {});
  }, args);
  const mutationId = await reached.promise;
  await page.unrouteAll({ behavior: "ignoreErrors" });

  await page.reload();
  await live(page);
  // The old page's lock can go a while after it: adoption looks again shortly, and the leader every 10 s
  // (TON-102).
  await expect.poll(() => stateOf(page, mutationId), { timeout: 25_000 }).toBe("confirmed");
  expect(await page.evaluate(() => window.tonarisSync?.albums.size)).toBe(1);
  expect((await saved(page)).albums.map((each) => each.id)).toEqual([args.id]);
});

test("a write made while the API can't be reached survives a reload, and is applied once it can", async ({
  page,
}) => {
  await signIn(page, accounts.syncQueued);
  await live(page);
  await page.route(`${apiUrl}/v1/mutations`, (route) => route.abort("internetdisconnected"));

  const args = album("Blue Train");
  await page.evaluate((value) => {
    window.tonarisSync?.albums.insert(value).isPersisted.promise.catch(() => {});
  }, args);
  await expect.poll(() => page.evaluate(() => window.tonarisSync?.outbox.queued.length)).toBe(1);

  await page.reload();
  await live(page);
  // Restored, and still unanswered while the API refuses it.
  await expect
    .poll(() => page.evaluate(() => window.tonarisSync?.outbox.queued[0]?.name))
    .toBe("album.create");

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.evaluate(() => window.tonarisSync?.outbox.wake());
  await expect
    .poll(async () => (await saved(page)).albums.map((each) => each.id))
    .toEqual([args.id]);
  await expect.poll(() => page.evaluate(() => window.tonarisSync?.unsent)).toBe(0);
});

test("edits made offline wait, never as saved, then go out in order once back online", async ({
  page,
  context,
}) => {
  await signIn(page, accounts.syncOffline);
  await live(page);
  const args = album("Kind of Blue");
  const list: Container = {
    id: uuidv7(),
    kind: "list",
    parentId: null,
    name: "Later",
    description: null,
  };
  await page.evaluate(
    async ([value, container]) => {
      const client = window.tonarisSync;
      await client?.albums.insert(value).isPersisted.promise;
      await client?.containers.insert(container).isPersisted.promise;
    },
    [args, list] as const,
  );

  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/mutations") && request.method() === "POST") {
      sent.push(mutationSchema.parse(request.postDataJSON()).name);
    }
  });
  await context.setOffline(true);
  await page.evaluate(
    ([listId, albumId]) => {
      const client = window.tonarisSync;
      client?.containers
        .update(listId, (draft) => {
          draft.name = "Favorites";
        })
        .isPersisted.promise.catch(() => {});
      client?.memberships
        .insert({ listId, albumId, addedAt: new Date().toISOString() })
        .isPersisted.promise.catch(() => {});
    },
    [list.id, args.id] as const,
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.tonarisSync?.outbox.queued.map(
          (mutation) => window.tonarisSync?.states.get(mutation.mutationId)?.status,
        ),
      ),
    )
    .toEqual(["unconfirmed", "pending"]);
  expect(await page.evaluate((id) => window.tonarisSync?.containers.get(id)?.name, list.id)).toBe(
    "Favorites",
  );

  await context.setOffline(false);
  await expect
    .poll(() => page.evaluate(() => window.tonarisSync?.unsent), { timeout: 15_000 })
    .toBe(0);
  expect(sent.filter((name, index) => name !== sent[index - 1])).toEqual([
    "container.rename",
    "membership.add",
  ]);
  const after = await saved(page);
  expect(after.containers.find((each) => each.id === list.id)?.name).toBe("Favorites");
  expect(after.memberships).toEqual([
    expect.objectContaining({ listId: list.id, albumId: args.id }),
  ]);
});

test("two tabs share one stream, and a write in either is saved in both", async ({
  page,
  context,
}) => {
  const streams = countStreams(context);
  await signIn(page, accounts.syncTabs);
  await live(page);
  const second = await context.newPage();
  await second.goto("/c");
  await live(second);
  expect(await second.evaluate(() => window.tonarisSync?.engine.leading)).toBe(false);

  const args = album("Kind of Blue");
  await second.evaluate(async (value) => {
    await window.tonarisSync?.albums.insert(value).isPersisted.promise;
  }, args);
  await expect
    .poll(() => page.evaluate((id) => window.tonarisSync?.albums.has(id), args.id))
    .toBe(true);
  expect(streams()).toBe(1);
});

test("when the streaming tab closes, the other takes the stream over and misses nothing", async ({
  page,
  context,
}) => {
  await signIn(page, accounts.syncHandover);
  await live(page);
  const second = await context.newPage();
  await second.goto("/c");
  await live(second);
  await page.close();

  const args = album("Kind of Blue");
  const response = await second.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name: "album.create", args },
  });
  expect(response.status()).toBe(200);
  await expect
    .poll(() => second.evaluate((id) => window.tonarisSync?.albums.has(id), args.id))
    .toBe(true);
  expect(await second.evaluate(() => window.tonarisSync?.engine.leading)).toBe(true);
});

test("a shown tab takes the stream from a leader gone silent, and never reads as offline (TON-137)", async ({
  page,
  context,
}) => {
  test.setTimeout(45_000);
  await signIn(page, accounts.syncSuspended);
  await live(page);
  expect(await page.evaluate(() => window.tonarisSync?.engine.leading)).toBe(true);
  const second = await context.newPage();
  await second.goto("/c");
  await live(second);
  expect(await second.evaluate(() => window.tonarisSync?.engine.leading)).toBe(false);

  // The leader stalls for 15 s, as when Android suspends Chrome while the installed app is on screen: it keeps its
  // lock, and says nothing more.
  const stalled = page.evaluate(() => {
    const until = Date.now() + 15_000;
    while (Date.now() < until) {
      // Busy: this page's timers, messages and stream wait.
    }
  });

  // Within the 10 s the leader may be silent, the shown tab takes the lead, before the 15 s that read as offline.
  await expect
    .poll(() => second.evaluate(() => window.tonarisSync?.engine.leading), { timeout: 14_000 })
    .toBe(true);
  await expect(second.locator('[data-slot="offline-banner"]')).toHaveCount(0);
  const args = album("Blue Train");
  const response = await second.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: { mutationId: uuidv7(), name: "album.create", args },
  });
  expect(response.status()).toBe(200);
  await expect
    .poll(() => second.evaluate((id) => window.tonarisSync?.albums.has(id), args.id))
    .toBe(true);

  // Awake again, the old leader follows.
  await stalled;
  await expect.poll(() => page.evaluate(() => window.tonarisSync?.engine.leading)).toBe(false);
});

test("signing out with unsent changes asks first, and then clears the browser's data", async ({
  page,
}) => {
  await signIn(page, accounts.syncSignOut);
  await live(page);
  const me = await page.request.get(`${apiUrl}/v1/me`);
  const { id: accountId } = accountSchema.parse(await me.json());
  await page.route(`${apiUrl}/v1/mutations`, (route) => route.abort("internetdisconnected"));
  await page.evaluate((value) => {
    window.tonarisSync?.albums.insert(value).isPersisted.promise.catch(() => {});
  }, album("Kind of Blue"));
  await expect.poll(() => page.evaluate(() => window.tonarisSync?.unsent)).toBe(1);

  const account = page.getByRole("button", { name: `Account: ${accounts.syncSignOut}` });
  const dialog = page.getByRole("alertdialog", { name: "Sign out with unsaved changes?" });
  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(dialog).toContainText("1 change hasn't been saved yet. Signing out discards it.");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => window.tonarisSync?.unsent)).toBe(1);

  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((each) => each.name),
  );
  expect(databases).not.toContain(`tonaris-sync:${accountId}`);
});
