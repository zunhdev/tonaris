// The workspace's save states as the browser tests drive and read them (DS-80 to DS-84). Until the collection has
// rows (TON-33, TON-34), the tests make their edits through the page's sync client (`TEST_HOOKS`), as the rows will.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { bootstrapSchema, uuidv7, type Album, type Container } from "@tonaris/domain";

import { apiUrl } from "./accounts";

export const webOrigin = "http://localhost:3100";

export const list = (name: string): Container => ({
  id: uuidv7(),
  kind: "list",
  parentId: null,
  name,
});

/**
 * Waits until the page has nothing left to send or confirm, before a navigation reloads it: an edit made just
 * before could otherwise still be on its way into the browser's storage.
 */
export async function saved(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.tonarisSync?.unsent === 0 && window.tonarisSync.states.open().length === 0,
  );
}

/** Waits until the page's sync client is connected. */
export async function live(page: Page): Promise<void> {
  await page.waitForFunction(() => window.tonarisSync?.engine.status === "live");
}

/** The account's lists as the API has them. */
export async function savedNames(page: Page): Promise<string[]> {
  const response = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
  return bootstrapSchema
    .parse(await response.json())
    .containers.map((each) => each.name)
    .toSorted();
}

/** Creates a list through the page's client, and waits until it is saved. */
export async function created(page: Page, name: string): Promise<Container> {
  const value = list(name);
  await page.evaluate(async (container) => {
    await window.tonarisSync?.containers.insert(container).isPersisted.promise;
  }, value);
  return value;
}

/** Writes without waiting for the outcome, as the interface does. */
export async function insert(page: Page, ...values: Container[]): Promise<void> {
  await page.evaluate((containers) => {
    window.tonarisSync?.containers.insert(containers).isPersisted.promise.catch(() => {});
  }, values);
}

export async function rename(page: Page, id: string, name: string): Promise<void> {
  await page.evaluate(
    ([listId, to]) => {
      window.tonarisSync?.containers
        .update(listId, (draft) => {
          draft.name = to;
        })
        .isPersisted.promise.catch(() => {});
    },
    [id, name] as const,
  );
}

/** Renames a list from another session, through the API. */
export async function renameElsewhere(
  page: Page,
  id: string,
  from: string,
  to: string,
): Promise<void> {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: {
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id, name: to },
      base: { name: from },
    },
  });
  expect(response.status()).toBe(200);
}

/**
 * Renames a list in the page while another session renames it first: the page's write is held on its way until
 * the other is saved, so it meets the newer name and comes back as a conflict.
 */
export async function conflictingRename(
  page: Page,
  value: Container,
  mine: string,
  theirs: string,
) {
  const held = Promise.withResolvers<void>();
  await page.route(`${apiUrl}/v1/mutations`, async (route) => {
    await held.promise;
    await route.continue();
  });
  await rename(page, value.id, mine);
  await renameElsewhere(page, value.id, value.name, theirs);
  held.resolve();
  await page.unrouteAll({ behavior: "wait" });
}

export const indicator = (page: Page) => page.getByRole("button", { name: /^Sync status:/ });
export const activity = (page: Page) => page.getByRole("dialog", { name: "Activity" });
export const toasts = (page: Page) => page.locator('[data-slot="toast"]');
export const announcements = (page: Page) => page.locator('[data-slot="announcer"]');

/** Axe's findings in `selector`, once its opening animation is over: mid-fade, its text is still faint. */
export async function violations(page: Page, selector: string) {
  await page
    .locator(selector)
    .evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((each) => each.finished)),
    );
  return (await new AxeBuilder({ page }).include(selector).analyze()).violations;
}

export async function openActivity(page: Page) {
  await indicator(page).click();
  await expect(activity(page)).toBeVisible();
  return activity(page);
}

/** How many batch reports the account's database in this browser keeps (DS-84). */
export async function keptReports(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const kept = (await indexedDB.databases()).find((each) =>
      each.name?.startsWith("tonaris-sync:"),
    );
    if (!kept?.name) return 0;
    const request = indexedDB.open(kept.name);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    try {
      const count = database.transaction("batches").objectStore("batches").count();
      return await new Promise<number>((resolve, reject) => {
        count.addEventListener("success", () => resolve(count.result));
        count.addEventListener("error", () => reject(count.error));
      });
    } finally {
      database.close();
    }
  });
}

/** An album with Candlemass as its artist, made in 1986 unless `values` say otherwise. */
export const album = (title: string, values: Partial<Album> = {}): Album => ({
  id: uuidv7(),
  title,
  artistCredit: "Candlemass",
  releaseType: "album",
  isLive: false,
  originalYear: 1986,
  recordingYearStart: null,
  recordingYearEnd: null,
  ...values,
});

/** Adds `albums` through the page's client, in `listId` if given, and waits until they are saved. */
export async function added(page: Page, albums: Album[], listId?: string): Promise<void> {
  await page.evaluate(
    async ({ owned, listId: into }) => {
      const sync = window.tonarisSync;
      if (!sync) throw new Error("No sync client on the page.");
      await sync.albums.insert(owned).isPersisted.promise;
      if (into) {
        const entries = owned.map((each) => ({
          listId: into,
          albumId: each.id,
          addedAt: new Date().toISOString(),
        }));
        await sync.memberships.insert(entries).isPersisted.promise;
      }
    },
    { owned: albums, listId },
  );
}
