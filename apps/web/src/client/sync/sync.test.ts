// The sync client end to end (TON-20, TON-30): TanStack DB collections in sessions and tabs of one account, against
// the real API and Postgres in a child process, with the network failing on demand. FR-09 and FR-13 as a person
// sees them: optimistic writes that settle only once saved, conflicts kept for review across reloads, unconfirmed
// writes reconciled without duplicates, also by the next tab, streams that resume or start over, and tabs sharing
// one stream. The browser's own storage, locks and channel are covered by the e2e suite.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import {
  batchSchema,
  membershipKey,
  fieldDeletionSchema,
  mutationSchema,
  optionRemovalSchema,
  serviceLinkKey,
  uuidv7,
  type Album,
  type Container,
  type Mutation,
} from "@tonaris/domain";

import type { SyncClient } from "./client";
import { memoryPersistence, type SyncPersistence } from "./persistence";
import { resubmit, resubmitAll } from "./resubmit";
import { memoryBrowser } from "./tabs";
import { sessionFetch, startApiServer, testClient, until, type TestServer } from "./testing";
import { MutationRejected, type SaveState } from "./writer";

let server: TestServer;
const open: SyncClient[] = [];

beforeAll(async () => {
  server = await startApiServer(43);
}, 30_000);

afterAll(async () => {
  await server.stop();
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((each) => each.stop()));
});

/** A started client for one of the server's accounts; each test uses its own account. */
async function openClient(
  account: number,
  session = 0,
  options: Parameters<typeof testClient>[2] = {},
) {
  const cookie = server.accounts[account]?.sessions[session];
  if (!cookie) throw new Error(`No session ${session} for account ${account}`);
  const started = testClient(server, cookie, options);
  open.push(started);
  if (options.cursor === undefined) await started.albums.preload();
  return started;
}

/** Watches the states of a record's writes, as its save marker would. */
function watch(of: SyncClient, key: string) {
  const seen: SaveState[] = [];
  of.states.subscribe((state) => {
    if (state.key === key) seen.push(state);
  });
  return {
    /** The statuses so far, in order and without repeats. */
    get statuses(): string[] {
      return seen
        .map((state) => state.status)
        .filter((status, index, all) => status !== all[index - 1]);
    },
    get last(): SaveState | undefined {
      return seen.at(-1);
    },
  };
}

const album = (values: Partial<Album> = {}): Album => ({
  id: uuidv7(),
  title: "Kind of Blue",
  artistCredit: "Miles Davis",
  releaseType: "album",
  isLive: false,
  originalYear: 1959,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  ...values,
});

async function saved(of: SyncClient, values: Partial<Album> = {}): Promise<Album> {
  const args = album(values);
  await of.albums.insert(args).when("settled");
  return args;
}

describe("optimistic writes (FR-09.1, FR-09.3)", () => {
  test("an insert shows at once, settles once the stream has it, and reaches the other session", async () => {
    const web = await openClient(0, 0);
    const phone = await openClient(0, 1);
    const args = album();
    const seen = watch(web, args.id);

    const startedAt = performance.now();
    const tx = web.albums.insert(args);
    // Optimistic in the same tick, marked as not yet saved.
    expect(web.albums.get(args.id)).toMatchObject({ ...args, $hasPendingWrites: true });
    await tx.when("settled");
    const confirmedAfter = performance.now() - startedAt;

    expect(seen.statuses).toEqual(["pending", "confirmed"]);
    expect(web.engine.seq).toBe(1);
    expect(web.albums.get(args.id)).toMatchObject({ ...args, $hasPendingWrites: false });
    await until(() => phone.albums.has(args.id), 3_000, "the phone to receive the album");
    expect(phone.albums.get(args.id)).toMatchObject(args);
    expect(confirmedAfter).toBeLessThan(1_000);
  });

  test("a session's writes go out in order: an edit made before its create is saved follows it", async () => {
    const web = await openClient(1, 0);
    const phone = await openClient(1, 1);
    const args = album();
    const created = web.albums.insert(args);
    const edited = web.albums.update(args.id, (draft) => {
      draft.title = "Kind of Blue (Legacy Edition)";
    });
    await Promise.all([created.when("settled"), edited.when("settled")]);

    expect(web.albums.get(args.id)?.title).toBe("Kind of Blue (Legacy Edition)");
    await until(() => phone.albums.get(args.id)?.title === "Kind of Blue (Legacy Edition)");
    expect(phone.engine.seq).toBe(2);
  });

  test("a rejected write rolls back and reports why, and nothing is saved (X-05)", async () => {
    const web = await openClient(2, 0);
    const args = await saved(web);
    const seen = watch(web, args.id);
    const tx = web.albums.update(args.id, (draft) => {
      draft.artistCredit = "  ";
    });
    expect(web.albums.get(args.id)?.artistCredit).toBe("  ");

    const error = await tx.when("settled").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MutationRejected);
    expect(web.albums.get(args.id)?.artistCredit).toBe("Miles Davis");
    expect(seen.statuses).toEqual(["pending", "failed"]);
    expect(seen.last?.outcome).toMatchObject({
      status: "failed",
      code: "required_missing",
      problem: { errors: [{ path: "artistCredit", message: "Required" }] },
    });
    expect(web.engine.seq).toBe(1);
  });
});

describe("conflicts (FR-09.4)", () => {
  test("an edit made from a stale value is kept unapplied, rolled back, and kept for review", async () => {
    const web = await openClient(3, 0);
    const phone = await openClient(3, 1);
    const args = await saved(web);
    await until(() => phone.albums.has(args.id));

    // The phone loses its stream, so it doesn't hear of the web's edit.
    phone.network.faults.noStream = true;
    phone.network.cutStreams();
    await web.albums
      .update(args.id, (draft) => {
        draft.title = "A";
      })
      .when("settled");

    const tx = phone.albums.update(args.id, (draft) => {
      draft.title = "B";
    });
    expect(phone.albums.get(args.id)?.title).toBe("B");
    expect(await tx.when("settled").catch((caught: unknown) => caught)).toBeInstanceOf(
      MutationRejected,
    );
    expect(phone.albums.get(args.id)?.title).toBe("Kind of Blue");
    expect(phone.states.conflicts().map((state) => state.outcome)).toEqual([
      {
        status: "conflict",
        conflicts: [{ field: "title", current: "A", attempted: "B", base: "Kind of Blue" }],
      },
    ]);

    // Back on the stream, the phone shows the newer saved value; the web never saw "B".
    phone.network.faults.noStream = false;
    await until(() => phone.albums.get(args.id)?.title === "A", 3_000, "the phone to catch up");
    expect(web.albums.get(args.id)?.title).toBe("A");
  });

  test("edits to different fields from two sessions both apply", async () => {
    const web = await openClient(4, 0);
    const phone = await openClient(4, 1);
    const args = await saved(web);
    await until(() => phone.albums.has(args.id));

    await Promise.all([
      web.albums
        .update(args.id, (draft) => {
          draft.title = "Kind of Blue (Mono)";
        })
        .when("settled"),
      phone.albums
        .update(args.id, (draft) => {
          draft.originalYear = 1960;
        })
        .when("settled"),
    ]);
    for (const session of [web, phone]) {
      // oxlint-disable-next-line no-await-in-loop
      await until(() => session.albums.get(args.id)?.originalYear === 1960);
      // oxlint-disable-next-line no-await-in-loop
      await until(() => session.albums.get(args.id)?.title === "Kind of Blue (Mono)");
    }
  });
});

describe("unconfirmed writes (FR-13.3, FR-13.5)", () => {
  test("a write whose answer is lost is unconfirmed, then reconciled once, with no duplicate", async () => {
    const web = await openClient(5, 0);
    const phone = await openClient(5, 1);
    web.network.faults.dropAnswers = 1;
    const args = album();
    const seen = watch(web, args.id);

    await web.albums.insert(args).when("settled");
    expect(seen.statuses).toEqual(["pending", "unconfirmed", "confirmed"]);
    // The same envelope went twice; the server applied it once.
    const sends = web.network.sent.filter((body) => body.includes(args.id));
    expect(sends).toHaveLength(2);
    expect(new Set(sends).size).toBe(1);
    await until(() => phone.albums.has(args.id));
    expect(phone.engine.seq).toBe(1);
  });

  test("a write that never reached the server is sent again and applied", async () => {
    const web = await openClient(6, 0);
    web.network.faults.failSends = 2;
    const args = album();
    const seen = watch(web, args.id);
    await web.albums.insert(args).when("settled");
    expect(seen.statuses).toEqual(["pending", "unconfirmed", "confirmed"]);
    expect(web.engine.seq).toBe(1);
  });

  test("a write made offline keeps its value as unconfirmed, never as saved, and goes out when back", async () => {
    const web = await openClient(7, 0);
    const phone = await openClient(7, 1);
    const args = await saved(web);
    await until(() => phone.albums.has(args.id));

    web.network.faults.offline = true;
    web.network.cutStreams();
    const seen = watch(web, args.id);
    const tx = web.albums.update(args.id, (draft) => {
      draft.title = "Edited offline";
    });
    await until(
      () => seen.statuses.includes("unconfirmed"),
      3_000,
      "the write to show as unconfirmed",
    );
    await Bun.sleep(300);
    expect(web.albums.get(args.id)?.title).toBe("Edited offline");
    expect(tx.state).toBe("persisting");
    expect(seen.statuses).not.toContain("confirmed");
    expect(phone.albums.get(args.id)?.title).toBe("Kind of Blue");

    web.network.faults.offline = false;
    await tx.when("settled");
    expect(seen.statuses).toEqual(["pending", "unconfirmed", "confirmed"]);
    await until(() => phone.albums.get(args.id)?.title === "Edited offline");
  });
});

describe("the stream (TS-23)", () => {
  test("a cut stream resumes from its cursor without gaps or repeats", async () => {
    const web = await openClient(8, 0);
    const phone = await openClient(8, 1);
    const applied: number[] = [];
    phone.engine.register({ reset: () => {}, apply: (change) => applied.push(change.seq) });

    await saved(web);
    await saved(web);
    await until(() => phone.engine.seq === 2);
    phone.network.faults.noStream = true;
    phone.network.cutStreams();
    await Promise.all([saved(web), saved(web), saved(web)]);
    phone.network.faults.noStream = false;

    await until(() => phone.engine.seq === 5, 3_000, "the phone to resume");
    expect(applied).toEqual([1, 2, 3, 4, 5]);
    expect(phone.albums.size).toBe(5);
  });

  test("a cursor the server can't continue makes the client bootstrap again", async () => {
    const web = await openClient(9, 0);
    const first = await saved(web);
    const second = await saved(web);
    // A cursor from somewhere else, as a restored client might keep.
    const restored = await openClient(9, 1, { cursor: 99 });
    await restored.albums.preload();
    expect(restored.engine.seq).toBe(2);
    expect(restored.albums.toArray.map((each) => each.id).toSorted()).toEqual(
      [first.id, second.id].toSorted(),
    );
  });
});

describe("folders and lists (FR-01.1, FR-01.3, FR-09.1)", () => {
  test("another session's new and renamed lists appear without reloading", async () => {
    const phone = await openClient(10, 1);
    await phone.containers.preload();
    const web = sessionFetch(server, server.accounts[10]?.sessions[0] ?? "");
    const post = async (mutation: Mutation) => {
      const response = await web.fetch(`${server.url}/v1/mutations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      });
      expect(response.status).toBe(200);
    };

    const id = uuidv7();
    await post({
      mutationId: uuidv7(),
      name: "container.create",
      args: { id, kind: "list", parentId: null, name: "Favorites" },
    });
    await until(() => phone.containers.get(id)?.name === "Favorites", 3_000, "the new list");
    await post({
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id, name: "Desert island" },
      base: { name: "Favorites" },
    });
    await until(() => phone.containers.get(id)?.name === "Desert island", 3_000, "the rename");
    expect(phone.containers.size).toBe(1);
  });
});

describe("list entries (FR-01.6, FR-01.8, FR-09.1)", () => {
  test("another session's added and removed albums show without reloading", async () => {
    const phone = await openClient(11, 1);
    await phone.memberships.preload();
    const web = sessionFetch(server, server.accounts[11]?.sessions[0] ?? "");
    const post = async (mutation: Mutation) => {
      const response = await web.fetch(`${server.url}/v1/mutations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      });
      expect(response.status).toBe(200);
    };

    const kindOfBlue = album();
    const listId = uuidv7();
    await post({ mutationId: uuidv7(), name: "album.create", args: kindOfBlue });
    await post({
      mutationId: uuidv7(),
      name: "container.create",
      args: { id: listId, kind: "list", parentId: null, name: "Favorites" },
    });
    const key = membershipKey(listId, kindOfBlue.id);
    const args = { listId, albumId: kindOfBlue.id };
    await post({ mutationId: uuidv7(), name: "membership.add", args });
    await until(() => phone.memberships.has(key), 3_000, "the entry");
    await post({ mutationId: uuidv7(), name: "membership.remove", args });
    await until(() => !phone.memberships.has(key), 3_000, "the removal");
    expect(phone.albums.get(kindOfBlue.id)?.title).toBe("Kind of Blue");
  });
});

/** A started client in a tab of `browser`, for one of the server's accounts, keeping its writes in `persistence`. */
async function openTab(
  account: number,
  browser: ReturnType<typeof memoryBrowser>,
  persistence: SyncPersistence,
): Promise<ReturnType<typeof testClient>> {
  const { id, sessions } = server.accounts[account] ?? { id: "", sessions: [] };
  const started = testClient(server, sessions[0] ?? "", {
    tabs: browser.tab(id),
    persistence,
    adoptEveryMs: 50,
  });
  open.push(started);
  await started.albums.preload();
  return started;
}

/** Writes through the API as another session of `account`, as a phone would. */
async function postAs(account: number, mutation: Mutation): Promise<void> {
  const web = sessionFetch(server, server.accounts[account]?.sessions[1] ?? "");
  const response = await web.fetch(`${server.url}/v1/mutations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(mutation),
  });
  expect(response.status).toBe(200);
}

/** Makes `phone` miss the stream, then saves a new title from `web`: the phone's view is stale. */
async function staleTitle(web: SyncClient, phone: ReturnType<typeof testClient>, id: string) {
  await until(() => phone.albums.has(id));
  phone.network.faults.noStream = true;
  phone.network.cutStreams();
  await web.albums
    .update(id, (draft) => {
      draft.title = "A";
    })
    .when("settled");
}

describe("rejected values (FR-09.3)", () => {
  test("after a title conflict, a pending year edit never shows the rejected title, and still saves", async () => {
    const web = await openClient(12, 0);
    const phone = await openClient(12, 1);
    const args = await saved(web);
    await staleTitle(web, phone, args.id);

    const title = phone.albums.update(args.id, (draft) => {
      draft.title = "B";
    });
    phone.albums.update(args.id, (draft) => {
      draft.originalYear = 1960;
    });
    expect(await title.when("settled").catch((caught: unknown) => caught)).toBeInstanceOf(
      MutationRejected,
    );
    expect(phone.albums.get(args.id)?.title).toBe("Kind of Blue");

    phone.network.faults.noStream = false;
    await until(
      () =>
        phone.albums.get(args.id)?.originalYear === 1960 &&
        phone.albums.get(args.id)?.title === "A",
      3_000,
      "the saved title and year",
    );
  });

  test("a conflict waits for review in the next client on the same storage, until dismissed", async () => {
    const persistence = memoryPersistence();
    const web = await openClient(13, 0);
    const phone = await openClient(13, 1, { persistence });
    const args = await saved(web);
    await staleTitle(web, phone, args.id);
    const tx = phone.albums.update(args.id, (draft) => {
      draft.title = "B";
    });
    await tx.when("settled").catch(() => {});
    await phone.stop();

    const later = await openClient(13, 1, { persistence });
    await until(() => later.states.conflicts().length === 1, 3_000, "the kept conflict");
    const [conflict] = later.states.conflicts();
    expect(conflict?.outcome).toEqual({
      status: "conflict",
      conflicts: [{ field: "title", current: "A", attempted: "B", base: "Kind of Blue" }],
    });
    later.states.dismiss(conflict?.mutation.mutationId ?? "");
    await Bun.sleep(1);
    expect(await persistence.conflicts()).toEqual([]);
  });
});

describe("folders, lists and entries (FR-09.3, TON-26, TON-27)", () => {
  test("a list created, renamed and moved, and an album added and removed, each saved and seen elsewhere", async () => {
    const web = await openClient(14, 0);
    const phone = await openClient(14, 1);
    await Promise.all([phone.containers.preload(), phone.memberships.preload()]);
    const args = await saved(web);
    const folder: Container = {
      id: uuidv7(),
      kind: "folder",
      parentId: null,
      name: "Jazz",
      description: null,
    };
    const list: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Favorites",
      description: null,
    };

    await web.containers.insert([folder, list]).when("settled");
    expect(web.network.writes.at(-1)).toBe("batches");
    await web.containers
      .update(list.id, (draft) => {
        draft.name = "Desert island";
        draft.parentId = folder.id;
      })
      .when("settled");
    await until(
      () =>
        phone.containers.get(list.id)?.name === "Desert island" &&
        phone.containers.get(list.id)?.parentId === folder.id,
      3_000,
      "the renamed and moved list",
    );

    const key = membershipKey(list.id, args.id);
    await web.memberships
      .insert({ listId: list.id, albumId: args.id, addedAt: new Date().toISOString() })
      .when("settled");
    await until(() => phone.memberships.has(key), 3_000, "the entry");
    await web.memberships.delete(key).when("settled");
    await until(() => !phone.memberships.has(key), 3_000, "the removal");
  });

  test("a list named like a sibling rolls back, and the conflict is reported", async () => {
    const web = await openClient(15, 0);
    await web.containers.preload();
    const later: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Later",
      description: null,
    };
    await web.containers.insert(later).when("settled");
    const twin: Container = { ...later, id: uuidv7(), name: "later" };
    const error = await web.containers
      .insert(twin)
      .when("settled")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MutationRejected);
    expect(web.containers.has(twin.id)).toBe(false);
    expect(error instanceof MutationRejected && error.outcome).toMatchObject({
      code: "name_conflict",
    });
  });

  test("three albums added in one action go as one batch, each settling on its own", async () => {
    const web = await openClient(16, 0);
    const three = [album({ title: "One" }), album({ title: "Two" }), album({ title: "Three" })];
    await web.albums.insert(three).when("settled");
    expect(web.network.writes).toEqual(["batches"]);
    expect(three.every((each) => web.albums.has(each.id))).toBe(true);
    const ids = batchSchema
      .parse(JSON.parse(web.network.sent[0] ?? "{}"))
      .items.map((item) => item.mutationId);
    expect(ids.map((id) => web.states.get(id)?.status)).toEqual([
      "confirmed",
      "confirmed",
      "confirmed",
    ]);
  });
});

describe("tabs sharing one stream (TS-23)", () => {
  test("two tabs hold one stream, and a write from the follower settles in both", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const first = await openTab(17, browser, persistence);
    await until(() => first.engine.leading, 3_000, "the first tab to lead");
    const second = await openTab(17, browser, persistence);
    expect(second.engine.leading).toBe(false);

    const args = album();
    await second.albums.insert(args).when("settled");
    await until(() => first.albums.has(args.id), 3_000, "the leader to show it");
    expect(first.network.streamsOpened + second.network.streamsOpened).toBe(1);
    expect(second.engine.status).toBe("live");
  });

  test("when the streaming tab closes, the other streams from its cursor and misses nothing", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const first = await openTab(18, browser, persistence);
    await until(() => first.engine.leading, 3_000, "the first tab to lead");
    const second = await openTab(18, browser, persistence);
    await first.stop();

    const args = album();
    await postAs(18, { mutationId: uuidv7(), name: "album.create", args });
    await until(() => second.albums.has(args.id), 3_000, "the change after the handover");
    expect(second.engine.leading).toBe(true);
    expect(second.network.streamsOpened).toBe(1);
  });

  test("a closed tab's write whose answer was lost is sent again by the next tab, and applied once", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const first = await openTab(19, browser, persistence);
    // The server saves the album, but no answer ever comes back before the tab closes.
    first.network.faults.dropAnswers = 1_000;
    const args = album();
    const tx = first.albums.insert(args);
    tx.isPersisted.promise.catch(() => {});
    await until(() => first.network.sent.length > 0, 3_000, "the send");
    await first.stop();
    expect(await persistence.entries()).toHaveLength(1);

    const second = await openTab(19, browser, persistence);
    const { mutationId } = mutationSchema.parse(JSON.parse(first.network.sent[0] ?? "{}"));
    await until(
      () => second.states.get(mutationId)?.status === "confirmed",
      3_000,
      "the reconciled write",
    );
    expect(second.albums.size).toBe(1);
    expect(second.albums.get(args.id)?.title).toBe("Kind of Blue");
    expect(await persistence.entries()).toEqual([]);
  });

  test("edits made while the API can't be reached go out in order once it can", async () => {
    const web = await openClient(20, 0);
    const phone = await openClient(20, 1);
    await Promise.all([web.containers.preload(), phone.memberships.preload()]);
    const args = await saved(web);
    const list: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Later",
      description: null,
    };
    await web.containers.insert(list).when("settled");

    web.network.faults.offline = true;
    web.network.cutStreams();
    const renamed = web.containers.update(list.id, (draft) => {
      draft.name = "Favorites";
    });
    const added = web.memberships.insert({
      listId: list.id,
      albumId: args.id,
      addedAt: new Date().toISOString(),
    });
    const [renameId, addId] = [...web.outbox.queued].map((mutation) => mutation.mutationId);
    await until(
      () => web.states.get(renameId ?? "")?.status === "unconfirmed",
      3_000,
      "unconfirmed",
    );
    expect(web.containers.get(list.id)?.name).toBe("Favorites");

    const before = web.network.sent.length;
    web.network.faults.offline = false;
    await Promise.all([renamed.when("settled"), added.when("settled")]);
    const order = web.network.sent
      .slice(before)
      .map((body) => mutationSchema.parse(JSON.parse(body)).name);
    expect(order.filter((name, index) => name !== order[index - 1])).toEqual([
      "container.rename",
      "membership.add",
    ]);
    expect(web.states.get(addId ?? "")?.status).toBe("confirmed");
    await until(
      () => phone.memberships.has(membershipKey(list.id, args.id)),
      3_000,
      "the entry elsewhere",
    );
  });
});

describe("changes from elsewhere (FR-09.1, DS-82)", () => {
  test("another session's rename is reported as from elsewhere, and a client's own isn't", async () => {
    const web = await openClient(21, 0);
    const phone = await openClient(21, 1);
    await Promise.all([web.containers.preload(), phone.containers.preload()]);
    const list: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Later",
      description: null,
    };
    await web.containers.insert(list).when("settled");
    await until(() => phone.containers.has(list.id), 3_000, "the list");

    const heard: string[] = [];
    web.elsewhere.subscribe(list.id, () => heard.push("web"));
    phone.elsewhere.subscribe(list.id, () => heard.push("phone"));
    await web.containers
      .update(list.id, (draft) => {
        draft.name = "Soon";
      })
      .when("settled");
    await until(() => phone.containers.get(list.id)?.name === "Soon", 3_000, "the rename");
    expect(heard).toEqual(["phone"]);

    await phone.containers
      .update(list.id, (draft) => {
        draft.name = "Now";
      })
      .when("settled");
    await until(() => web.containers.get(list.id)?.name === "Now", 3_000, "the second rename");
    expect(heard).toEqual(["phone", "web"]);
  });
});

/** A failed write's state, for resubmitting. */
const failedWrite = (mutation: Mutation): SaveState => ({
  mutation,
  key: "",
  status: "failed",
  since: Date.now(),
});

describe("resubmitting (DS-80, FR-09.4, FR-13.2)", () => {
  test("Apply mine saves a conflicting title over the newer value, and clears the conflict", async () => {
    const web = await openClient(22, 0);
    const phone = await openClient(22, 1);
    const args = await saved(web);
    await staleTitle(web, phone, args.id);
    await phone.albums
      .update(args.id, (draft) => {
        draft.title = "B";
      })
      .when("settled")
      .catch(() => {});
    phone.network.faults.noStream = false;
    await until(() => phone.albums.get(args.id)?.title === "A", 3_000, "the newer title");

    const [conflict] = phone.states.conflicts();
    expect(conflict && resubmit(phone, conflict)).toBe("sent");
    expect(phone.states.conflicts()).toEqual([]);
    await until(() => web.albums.get(args.id)?.title === "B", 3_000, "the applied title");
    await until(() => phone.states.open().length === 0, 3_000, "the write to be confirmed");
  });

  test("Retry saves a list whose name was taken, once the other list is renamed", async () => {
    const web = await openClient(23, 0);
    await web.containers.preload();
    const later: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Later",
      description: null,
    };
    await web.containers.insert(later).when("settled");
    const twin: Container = { ...later, id: uuidv7() };
    await web.containers
      .insert(twin)
      .when("settled")
      .catch(() => {});
    const [failed] = web.states.open();
    expect(failed?.outcome).toMatchObject({ status: "failed", code: "name_conflict" });

    await web.containers
      .update(later.id, (draft) => {
        draft.name = "Soon";
      })
      .when("settled");
    expect(failed && resubmit(web, failed)).toBe("sent");
    await until(() => web.states.open().length === 0, 3_000, "the retried list to be confirmed");
    expect(web.containers.get(twin.id)?.name).toBe("Later");
  });

  test("an attempt the records already hold sends nothing, and a gone record's is reported", async () => {
    const web = await openClient(24, 0);
    await web.containers.preload();
    const list: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Later",
      description: null,
    };
    await web.containers.insert(list).when("settled");
    const before = web.network.sent.length;

    const rename: Mutation = {
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id: list.id, name: "Later" },
      base: { name: "Sooner" },
    };
    expect(resubmit(web, failedWrite(rename))).toBe("unchanged");
    const edit: Mutation = {
      mutationId: uuidv7(),
      name: "album.update",
      args: { id: uuidv7(), title: "B" },
      base: { title: "A" },
    };
    expect(resubmit(web, failedWrite(edit))).toBe("gone");
    expect(web.network.sent.length).toBe(before);
  });
});

describe("batch reports (FR-13.4, FR-13.5, DS-84)", () => {
  test("a partial batch keeps its successes, skips what built on a failure, and a retry inside the report saves the rest once", async () => {
    const web = await openClient(25, 0);
    await web.containers.preload();
    const later: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Later",
      description: null,
    };
    await web.containers.insert(later).when("settled");

    // One action: a folder whose name is taken, a list inside it, and another list.
    const folder: Container = {
      id: uuidv7(),
      kind: "folder",
      parentId: null,
      name: "Later",
      description: null,
    };
    const inside: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: folder.id,
      name: "Doom",
      description: null,
    };
    const soon: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Soon",
      description: null,
    };
    const error = await web.containers
      .insert([folder, inside, soon])
      .when("settled")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MutationRejected);
    const body = batchSchema.parse(JSON.parse(web.network.sent.at(-1) ?? "{}"));
    const [folderWrite, insideWrite] = body.items.map((item) => item.mutationId);
    expect(body.items.map((item) => item.dependsOn)).toEqual([undefined, [folderWrite], undefined]);

    const [report] = web.states.reports();
    expect(report?.kept).toBe(true);
    expect(report?.items.map((item) => item.outcome)).toEqual([
      expect.objectContaining({ status: "failed", code: "name_conflict" }),
      { status: "skipped", dependsOn: folderWrite, because: "failed" },
      expect.objectContaining({ status: "confirmed" }),
    ]);
    // The success stays; what failed or was skipped rolled back.
    expect(web.containers.has(soon.id)).toBe(true);
    expect(web.containers.has(folder.id) || web.containers.has(inside.id)).toBe(false);

    await web.containers
      .update(later.id, (draft) => {
        draft.name = "Earlier";
      })
      .when("settled");
    const sentBefore = web.network.sent.length;
    const retried = (report?.items ?? []).filter(
      (item) =>
        item.mutation.mutationId === folderWrite || item.mutation.mutationId === insideWrite,
    );
    const results = web.states.within(report?.id ?? "", () => resubmitAll(web, retried));
    expect(results).toEqual(["sent", "sent"]);
    await until(
      () => web.states.reports()[0]?.items.every((item) => item.status === "confirmed") ?? false,
      3_000,
      "the retried writes to be confirmed",
    );

    // Both went in one batch again, in the same report, and the list saved the first time wasn't sent again.
    expect(web.network.sent.length).toBe(sentBefore + 1);
    const again = batchSchema.parse(JSON.parse(web.network.sent.at(-1) ?? "{}"));
    expect(again.items.map((item) => item.dependsOn)).toEqual([
      undefined,
      [again.items[0]?.mutationId],
    ]);
    expect(web.states.reports().map((each) => each.id)).toEqual([report?.id ?? ""]);
    expect(web.states.reports()[0]?.items).toHaveLength(3);
    expect(web.containers.get(inside.id)).toMatchObject({ parentId: folder.id, name: "Doom" });
    const names = [...web.containers.values()].map((each) => each.name).toSorted();
    expect(names).toEqual(["Doom", "Earlier", "Later", "Soon"]);
  });
});

/** The `view.set` and `defaults.set` envelopes sent after `from`, as the server got them. */
const preferenceWrites = (of: ReturnType<typeof testClient>, from: number) =>
  of.network.sent
    .slice(from)
    .map((body) => mutationSchema.parse(JSON.parse(body)))
    .filter((mutation) => mutation.name === "view.set" || mutation.name === "defaults.set")
    .map(({ name, args, base }) => ({ name, args, base }));

describe("view choices and defaults (FR-11.7, FR-11.8, FR-09.2)", () => {
  test("a view's choices are sent from their prior values, and reach the other session live", async () => {
    const web = await openClient(26, 0);
    const phone = await openClient(26, 1);
    await Promise.all([web.views.preload(), phone.views.preload(), phone.defaults.preload()]);
    const sent = web.network.sent.length;

    await web.views
      .insert({
        viewKey: "unsorted",
        sortMode: "name",
        sortDir: "desc",
        grouped: null,
        layout: null,
      })
      .when("settled");
    await web.views
      .update("unsorted", (draft) => {
        draft.grouped = true;
      })
      .when("settled");
    await web.views
      .update("unsorted", (draft) => {
        draft.sortDir = "asc";
      })
      .when("settled");
    await until(
      () => phone.views.get("unsorted")?.sortDir === "asc",
      3_000,
      "the other session's view",
    );
    expect(phone.views.get("unsorted")).toMatchObject({
      viewKey: "unsorted",
      sortMode: "name",
      sortDir: "asc",
      grouped: true,
      layout: null,
    });

    await web.views.delete("unsorted").when("settled");
    await web.defaults
      .update("defaults", (draft) => {
        draft.layout = "grid";
      })
      .when("settled");
    await until(
      () => phone.defaults.get("defaults")?.layout === "grid",
      3_000,
      "the other session's defaults",
    );
    expect(phone.views.has("unsorted")).toBe(false);
    expect(preferenceWrites(web, sent)).toEqual([
      {
        name: "view.set",
        args: { viewKey: "unsorted", sortMode: "name", sortDir: "desc" },
        base: { sortMode: null, sortDir: null },
      },
      { name: "view.set", args: { viewKey: "unsorted", grouped: true }, base: { grouped: null } },
      // The direction alone changed, and the sort goes with it.
      {
        name: "view.set",
        args: { viewKey: "unsorted", sortMode: "name", sortDir: "asc" },
        base: { sortMode: "name", sortDir: "desc" },
      },
      {
        name: "view.set",
        args: { viewKey: "unsorted", sortMode: null, sortDir: null, grouped: null },
        base: { sortMode: "name", sortDir: "asc", grouped: true },
      },
      { name: "defaults.set", args: { layout: "grid" }, base: { layout: "rows" } },
    ]);
    // A view's choices have their own save state, never the list's.
    expect(web.states.open()).toEqual([]);
  });

  test("Retry makes a view choice again against the current row, or reports a gone list", async () => {
    const web = await openClient(27, 0);
    await Promise.all([web.views.preload(), web.containers.preload(), web.defaults.preload()]);
    const choice: Mutation = {
      mutationId: uuidv7(),
      name: "view.set",
      args: { viewKey: "root", sortMode: "name", sortDir: "asc" },
      base: { sortMode: null, sortDir: null },
    };
    expect(resubmit(web, failedWrite(choice))).toBe("sent");
    await until(() => web.views.get("root")?.sortMode === "name", 3_000, "the retried choice");
    expect(resubmit(web, failedWrite(choice))).toBe("unchanged");

    const gone: Mutation = {
      ...choice,
      mutationId: uuidv7(),
      args: { ...choice.args, viewKey: uuidv7() },
    };
    expect(resubmit(web, failedWrite(gone))).toBe("gone");
    const defaults: Mutation = {
      mutationId: uuidv7(),
      name: "defaults.set",
      args: { grouped: true },
      base: { grouped: false },
    };
    expect(resubmit(web, failedWrite(defaults))).toBe("sent");
    await until(() => web.defaults.get("defaults")?.grouped === true, 3_000, "the retried default");
    await until(() => web.states.open().length === 0, 3_000, "the writes to be confirmed");
  });
});

/** The `order.set` envelopes sent after `from`. */
const orderWrites = (of: ReturnType<typeof testClient>, from: number) =>
  of.network.sent
    .slice(from)
    .map((body) => mutationSchema.parse(JSON.parse(body)))
    .filter((mutation) => mutation.name === "order.set")
    .map(({ args, base }) => ({ args, base }));

describe("manual order (TS-16, FR-05.2, FR-09.4)", () => {
  test("a move is one order.set with its bases, and reaches the other session", async () => {
    const web = await openClient(28, 0);
    const phone = await openClient(28, 1);
    await Promise.all([
      web.containers.preload(),
      web.positions.preload(),
      phone.positions.preload(),
    ]);
    const later: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Later",
      description: null,
    };
    const doom: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Doom",
      description: null,
    };
    await web.containers.insert([later, doom]).when("settled");
    const sent = web.network.sent.length;

    await web.arrange(
      "root",
      new Map([
        [later.id, "a0"],
        [doom.id, "Zz"],
      ]),
    ).isPersisted.promise;
    await web.arrange("root", new Map([[later.id, "Zy"]])).isPersisted.promise;
    expect(orderWrites(web, sent)).toEqual([
      {
        args: { viewKey: "root", keys: { [later.id]: "a0", [doom.id]: "Zz" } },
        base: { [later.id]: null, [doom.id]: null },
      },
      { args: { viewKey: "root", keys: { [later.id]: "Zy" } }, base: { [later.id]: "a0" } },
    ]);
    await until(
      () => phone.positions.get(`root:${later.id}`)?.key === "Zy",
      3_000,
      "the other session's move",
    );
    expect(web.states.open()).toEqual([]);
  });

  test("moving an item another session moved first is rolled back, kept for review, and Apply mine saves it", async () => {
    const web = await openClient(29, 0);
    const phone = await openClient(29, 1);
    await Promise.all([
      web.containers.preload(),
      web.positions.preload(),
      phone.positions.preload(),
    ]);
    const doom: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Doom",
      description: null,
    };
    await web.containers.insert(doom).when("settled");
    await until(() => phone.containers.has(doom.id));
    phone.network.faults.noStream = true;
    phone.network.cutStreams();
    await web.arrange("root", new Map([[doom.id, "a0"]])).isPersisted.promise;

    await phone.arrange("root", new Map([[doom.id, "Zz"]])).isPersisted.promise.catch(() => {});
    const [conflict] = phone.states.conflicts();
    expect(conflict?.outcome).toEqual({
      status: "conflict",
      conflicts: [{ field: doom.id, current: "a0", attempted: "Zz", base: null }],
    });
    phone.network.faults.noStream = false;
    await until(
      () => phone.positions.get(`root:${doom.id}`)?.key === "a0",
      3_000,
      "the saved place",
    );

    expect(conflict && resubmit(phone, conflict)).toBe("sent");
    await until(
      () => web.positions.get(`root:${doom.id}`)?.key === "Zz",
      3_000,
      "the applied place",
    );
    expect(
      conflict &&
        resubmit(phone, { ...conflict, mutation: { ...conflict.mutation, mutationId: uuidv7() } }),
    ).toBe("unchanged");
  });
});

describe("links (FR-06.2, FR-06.3, FR-09.1)", () => {
  const variant = "https://open.spotify.com/intl-de/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=abc";
  const canonical = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";

  test("a link added as pasted settles as its canonical URL, and other sessions follow its changes", async () => {
    const web = await openClient(30, 0);
    const phone = await openClient(30, 1);
    await Promise.all([web.links.preload(), phone.links.preload()]);
    const { id: albumId } = await saved(web);
    const key = serviceLinkKey(albumId, "spotify");

    await web.links.insert({ albumId, service: "spotify", url: variant }).isPersisted.promise;
    expect(web.links.get(key)?.url).toBe(canonical);
    await until(() => phone.links.get(key)?.url === canonical, 3_000, "the link on the phone");

    const other = "https://open.spotify.com/album/6jD6Wl5TgtrC8GJkplOtW9";
    await web.links.update(key, (draft) => {
      draft.url = other;
    }).isPersisted.promise;
    await until(() => phone.links.get(key)?.url === other, 3_000, "the replacement");
    await web.links.delete(key).isPersisted.promise;
    await until(() => !phone.links.has(key), 3_000, "the removal");
  });

  test("a removal over a replaced link conflicts, and Apply mine removes the newer one", async () => {
    const web = await openClient(31, 0);
    const phone = await openClient(31, 1);
    await Promise.all([web.links.preload(), phone.links.preload()]);
    const { id: albumId } = await saved(web);
    const key = serviceLinkKey(albumId, "spotify");
    await web.links.insert({ albumId, service: "spotify", url: canonical }).isPersisted.promise;
    await until(() => phone.links.has(key), 3_000, "the link on the phone");

    phone.network.faults.noStream = true;
    phone.network.cutStreams();
    const other = "https://open.spotify.com/album/6jD6Wl5TgtrC8GJkplOtW9";
    await web.links.update(key, (draft) => {
      draft.url = other;
    }).isPersisted.promise;
    await phone.links
      .delete(key)
      .isPersisted.promise.catch((error: unknown) =>
        expect(error).toBeInstanceOf(MutationRejected),
      );
    const [conflict] = phone.states.conflicts();
    expect(conflict?.outcome).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "url", current: other, base: canonical }],
    });

    phone.network.faults.noStream = false;
    await until(() => phone.links.get(key)?.url === other, 3_000, "the newer link");
    expect(conflict && resubmit(phone, conflict)).toBe("sent");
    await until(() => !web.links.has(key), 3_000, "the applied removal");
  });
});

/** The captures a client hasn't saved yet. */
const capturesOf = (of: SyncClient) =>
  of.states.open().filter((state) => state.mutation.name === "album.capture");

describe("captures (TON-45, TS-22)", () => {
  // The test API answers these from its fixtures (apps/api/src/capture-fixtures.ts).
  const links = {
    bleach: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
    nevermind: "https://music.apple.com/us/album/nevermind/1440783617",
    ambiguous: "https://music.apple.com/us/album/1000000002",
    slow: "https://open.spotify.com/album/0000000000000000000007",
    flaky: "https://open.spotify.com/album/0000000000000000000008",
  };

  test("a capture into a list made just before it finds the list, and a rename made after isn't held up", async () => {
    const web = await openClient(32, 0);
    await Promise.all([web.containers.preload(), web.memberships.preload()]);
    const doom: Container = {
      id: uuidv7(),
      kind: "list",
      parentId: null,
      name: "Doom",
      description: null,
    };
    const created = web.containers.insert(doom);
    const [capture] = web.captures.send([{ link: links.slow, listId: doom.id }]);
    await created.isPersisted.promise;
    const renamed = web.containers.update(doom.id, (draft) => {
      draft.name = "Heavy";
    });
    await renamed.isPersisted.promise;
    // The rename is saved while the capture still waits on MusicBrainz.
    expect(capture && web.states.get(capture.mutationId)?.status).toBe("pending");

    await until(
      () => capture !== undefined && web.states.get(capture.mutationId)?.status === "confirmed",
      10_000,
      "the capture",
    );
    const master = [...web.albums.values()].find((each) => each.title === "Master of Reality");
    expect(master && web.memberships.has(membershipKey(doom.id, master.id))).toBe(true);
  });

  test("a batch settles item by item, and a choice waits while the others are saved", async () => {
    const web = await openClient(33, 0);
    const sent = web.captures.send([
      { link: links.bleach, listId: null },
      { link: links.ambiguous, listId: null },
      { link: links.nevermind, listId: null },
    ]);
    expect(sent).toHaveLength(3);
    await until(
      () => web.states.reports()[0]?.items.every((item) => item.status !== "pending") === true,
      10_000,
      "the batch",
    );
    const [report] = web.states.reports();
    expect(report?.items.map((item) => item.status)).toEqual([
      "confirmed",
      "needs_input",
      "confirmed",
    ]);
    const waiting = report?.items[1];
    expect(waiting?.outcome).toMatchObject({
      status: "needs_input",
      need: "match",
      candidates: [{ title: "The Last in Line" }, { title: "Holy Diver" }],
    });

    // Choosing completes it in the same report.
    const [first] = waiting?.outcome?.status === "needs_input" ? waiting.outcome.candidates : [];
    const releaseGroupId =
      typeof first === "object" && first !== null && "releaseGroupId" in first
        ? String(first.releaseGroupId)
        : "";
    const again = waiting && web.captures.again(waiting, { releaseGroupId });
    await until(
      () => again !== undefined && web.states.get(again.mutationId)?.status === "confirmed",
      10_000,
      "the chosen album",
    );
    expect([...web.albums.values()].map((each) => each.title).toSorted()).toEqual([
      "Bleach",
      "Nevermind",
      "The Last in Line",
    ]);
    expect(web.states.reports()[0]?.items.map((item) => item.status)).toEqual([
      "confirmed",
      "confirmed",
      "confirmed",
    ]);
  });

  test("a capture waiting for a choice is kept across a reload", async () => {
    const persistence = memoryPersistence();
    const first = await openClient(34, 0, { persistence });
    first.captures.send([{ link: links.ambiguous, listId: null }]);
    await until(() => capturesOf(first)[0]?.status === "needs_input", 10_000, "the choice");
    await first.stop();

    const second = await openClient(34, 0, { persistence });
    await until(() => capturesOf(second).length === 1, 3_000, "the kept choice");
    expect(capturesOf(second)[0]?.mutation.args).toMatchObject({ link: links.ambiguous });
  });

  test("Retry sends a failed capture again, and saves it once the source answers", async () => {
    const web = await openClient(35, 0);
    web.captures.send([{ link: links.flaky, listId: null }]);
    await until(() => capturesOf(web)[0]?.status === "failed", 10_000, "the failure");
    const [failed] = capturesOf(web);
    expect(failed?.outcome).toMatchObject({ status: "failed", code: "provider_unavailable" });
    expect(failed && resubmit(web, failed)).toBe("sent");
    await until(
      () => [...web.albums.values()].some((each) => each.title === "Paranoid"),
      10_000,
      "the retried album",
    );
    await until(() => capturesOf(web).length === 0, 3_000, "the capture to be saved");
  });
});

describe("custom fields (FR-03.6, FR-03.11, FR-09.1)", () => {
  test("a field defined and renamed in one session reaches another without reloading", async () => {
    const web = await openClient(36, 0);
    const phone = await openClient(36, 1);
    await Promise.all([web.fields.preload(), phone.fields.preload()]);
    const id = uuidv7();
    const options = [
      { id: uuidv7(), label: "Calm" },
      { id: uuidv7(), label: "Loud" },
    ];
    await web.fields.insert({ id, name: "Mood", type: "single_choice", options }).isPersisted
      .promise;
    await until(() => phone.fields.get(id)?.name === "Mood", 3_000, "the field on the phone");
    expect(phone.fields.get(id)?.options).toEqual(options);
    await web.fields.update(id, (draft) => {
      draft.name = "Feel";
    }).isPersisted.promise;
    await until(() => phone.fields.get(id)?.name === "Feel", 3_000, "the rename on the phone");
  });
});

describe("custom field values (FR-03.7, FR-03.8, FR-09.1)", () => {
  test("a field applied, set and removed in one session follows in another", async () => {
    const web = await openClient(37, 0);
    const phone = await openClient(37, 1);
    await Promise.all([
      web.fields.preload(),
      web.fieldValues.preload(),
      phone.fieldValues.preload(),
    ]);
    const { id: albumId } = await saved(web);
    const fieldId = uuidv7();
    await web.fields.insert({ id: fieldId, name: "Rating", type: "number", options: [] })
      .isPersisted.promise;
    const key = `${albumId}:${fieldId}`;
    // Applied with a value: `fieldValue.apply`, then `fieldValue.set`, in one request.
    await web.fieldValues.insert({ albumId, fieldId, value: "4.5" }).isPersisted.promise;
    await until(() => phone.fieldValues.get(key)?.value === "4.5", 3_000, "the value");
    await web.fieldValues.update(key, (draft) => {
      draft.value = null;
    }).isPersisted.promise;
    await until(() => phone.fieldValues.get(key)?.value === null, 3_000, "applied-empty");
    await web.fieldValues.delete(key).isPersisted.promise;
    await until(() => !phone.fieldValues.has(key), 3_000, "the removal");
  });
});

describe("custom field options (FR-03.15 to FR-03.17, TS-14)", () => {
  test("options renamed, added and removed in one session follow in another, a chosen one once confirmed", async () => {
    const web = await openClient(38, 0);
    const phone = await openClient(38, 1);
    await Promise.all([
      web.fields.preload(),
      web.fieldValues.preload(),
      phone.fields.preload(),
      phone.fieldValues.preload(),
    ]);
    const { id: albumId } = await saved(web);
    const [fieldId, calm, loud, odd] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    await web.fields.insert({
      id: fieldId,
      name: "Mood",
      type: "single_choice",
      options: [
        { id: calm, label: "Calm" },
        { id: loud, label: "Loud" },
      ],
    }).isPersisted.promise;
    await web.fieldValues.insert({ albumId, fieldId, value: calm }).isPersisted.promise;

    await web.fields.update(fieldId, (draft) => {
      draft.options = [
        { id: calm, label: "Quiet" },
        { id: odd, label: "Odd" },
      ];
    }).isPersisted.promise;
    const labels = () =>
      phone.fields
        .get(fieldId)
        ?.options.map((option) => option.label)
        .join();
    await until(() => labels() === "Quiet,Odd", 3_000, "the options");

    // "Quiet" is chosen: its removal needs the scope's hash.
    const session = sessionFetch(server, server.accounts[38]?.sessions[0] ?? "");
    const response = await session.fetch(
      `${server.url}/v1/fields/${fieldId}/options/${calm}/removal`,
    );
    const { scopeHash } = optionRemovalSchema.parse(await response.json());
    await web.fields.update(
      fieldId,
      { metadata: { confirmed: { [calm]: scopeHash } } },
      (draft) => {
        draft.options = [{ id: odd, label: "Odd" }];
      },
    ).isPersisted.promise;
    await until(() => labels() === "Odd", 3_000, "the removal");
    await until(
      () => phone.fieldValues.get(`${albumId}:${fieldId}`)?.value === null,
      3_000,
      "the cleared value",
    );
  });
});

describe("deleting a custom field (FR-03.18, TS-14)", () => {
  test("a field deleted in one session goes from another, with its values", async () => {
    const web = await openClient(39, 0);
    const phone = await openClient(39, 1);
    await Promise.all([
      web.fields.preload(),
      web.fieldValues.preload(),
      phone.fields.preload(),
      phone.fieldValues.preload(),
    ]);
    const { id: albumId } = await saved(web);
    const fieldId = uuidv7();
    await web.fields.insert({ id: fieldId, name: "Rating", type: "number", options: [] })
      .isPersisted.promise;
    await web.fieldValues.insert({ albumId, fieldId, value: "4" }).isPersisted.promise;
    const key = `${albumId}:${fieldId}`;
    await until(() => phone.fieldValues.has(key), 3_000, "the value");

    const session = sessionFetch(server, server.accounts[39]?.sessions[0] ?? "");
    const response = await session.fetch(`${server.url}/v1/fields/${fieldId}/deletion`);
    const { scopeHash, albums } = fieldDeletionSchema.parse(await response.json());
    expect(albums).toBe(1);
    await web.fields.delete(fieldId, { metadata: { confirmed: { [fieldId]: scopeHash } } })
      .isPersisted.promise;
    await until(() => !phone.fields.has(fieldId), 3_000, "the deletion");
    await until(() => !phone.fieldValues.has(key), 3_000, "the value's removal");
  });
});

describe("folder and list descriptions (FR-03.5, FR-09.1)", () => {
  test("a description written in one session follows in another, and a new list may start with one", async () => {
    const web = await openClient(40, 0);
    const phone = await openClient(40, 1);
    await Promise.all([web.containers.preload(), phone.containers.preload()]);
    const id = uuidv7();
    // Created with a description: `container.create`, then `container.describe`, in one request.
    await web.containers.insert({
      id,
      kind: "list",
      parentId: null,
      name: "Grunge",
      description: "Seattle",
    }).isPersisted.promise;
    await until(
      () => phone.containers.get(id)?.description === "Seattle",
      3_000,
      "the description",
    );
    await web.containers.update(id, (draft) => {
      draft.description = null;
    }).isPersisted.promise;
    await until(() => phone.containers.get(id)?.description === null, 3_000, "the cleared one");
  });
});

describe("Trash (FR-01.11, FR-01.13, TON-55)", () => {
  test("a list deleted in one session leaves another, its entry too, and comes back when recovered", async () => {
    const web = await openClient(41, 0);
    const phone = await openClient(41, 1);
    await Promise.all([
      web.containers.preload(),
      web.memberships.preload(),
      web.trashUnits.preload(),
      phone.containers.preload(),
      phone.memberships.preload(),
      phone.trashUnits.preload(),
    ]);
    const listId = uuidv7();
    await web.containers.insert({
      id: listId,
      kind: "list",
      parentId: null,
      name: "Doom",
      description: null,
    }).isPersisted.promise;
    const { id: albumId } = await saved(web);
    await web.memberships.insert({ listId, albumId, addedAt: new Date().toISOString() }).isPersisted
      .promise;
    const entry = `${listId}:${albumId}`;
    await until(() => phone.memberships.has(entry), 3_000, "the entry");

    const { transaction, deleted } = web.trash.deleteContainers([listId]);
    expect(web.containers.has(listId)).toBe(false);
    await transaction.isPersisted.promise;
    await until(
      () => !phone.containers.has(listId) && !phone.memberships.has(entry),
      3_000,
      "the deletion",
    );
    const [unit] = deleted.units;
    await until(() => phone.trashUnits.get(unit?.unitId ?? "")?.name === "Doom", 3_000, "the unit");

    const [made] = deleted.units;
    await web.trash.recover(made ?? { unitId: "", rootId: listId }, {}, deleted).transaction
      .isPersisted.promise;
    await until(
      () => phone.containers.has(listId) && phone.memberships.has(entry),
      3_000,
      "the recovery",
    );
    await until(() => !phone.trashUnits.has(unit?.unitId ?? ""), 3_000, "the unit's end");
  });
});

describe("albums in Trash (FR-14.1, FR-14.2, TON-57)", () => {
  test("an album deleted in one session leaves another with its entries, and is restored to its list", async () => {
    const web = await openClient(42, 0);
    const phone = await openClient(42, 1);
    await Promise.all([
      web.albums.preload(),
      web.memberships.preload(),
      web.trashUnits.preload(),
      phone.albums.preload(),
      phone.memberships.preload(),
      phone.trashUnits.preload(),
    ]);
    const listId = uuidv7();
    await web.containers.insert({
      id: listId,
      kind: "list",
      parentId: null,
      name: "Doom",
      description: null,
    }).isPersisted.promise;
    const { id: albumId } = await saved(web);
    await web.memberships.insert({ listId, albumId, addedAt: new Date().toISOString() }).isPersisted
      .promise;
    const entry = `${listId}:${albumId}`;
    await until(() => phone.memberships.has(entry), 3_000, "the entry");

    const { transaction, unitId } = web.trash.deleteAlbum(albumId);
    expect(web.albums.has(albumId)).toBe(false);
    await transaction.isPersisted.promise;
    await until(
      () => !phone.albums.has(albumId) && !phone.memberships.has(entry),
      3_000,
      "the deletion",
    );
    await until(() => phone.trashUnits.get(unitId)?.kind === "album", 3_000, "the unit");

    await web.trash.recover({ unitId, rootId: albumId }).transaction.isPersisted.promise;
    await until(
      () => phone.albums.has(albumId) && phone.memberships.has(entry),
      3_000,
      "the restore",
    );
  });
});
