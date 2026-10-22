// The sync client end to end (TON-20, TON-30): TanStack DB collections in sessions and tabs of one account, against
// the real API and Postgres in a child process, with the network failing on demand. FR-09 and FR-13 as a person
// sees them: optimistic writes that settle only once saved, conflicts kept for review across reloads, unconfirmed
// writes reconciled without duplicates, also by the next tab, streams that resume or start over, and tabs sharing
// one stream. The browser's own storage, locks and channel are covered by the e2e suite.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import {
  batchSchema,
  membershipKey,
  mutationSchema,
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
  server = await startApiServer(26);
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
    const folder: Container = { id: uuidv7(), kind: "folder", parentId: null, name: "Jazz" };
    const list: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Favorites" };

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
    const later: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Later" };
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
    const list: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Later" };
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
    const list: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Later" };
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
    const later: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Later" };
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
    const list: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Later" };
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
    const later: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Later" };
    await web.containers.insert(later).when("settled");

    // One action: a folder whose name is taken, a list inside it, and another list.
    const folder: Container = { id: uuidv7(), kind: "folder", parentId: null, name: "Later" };
    const inside: Container = { id: uuidv7(), kind: "list", parentId: folder.id, name: "Doom" };
    const soon: Container = { id: uuidv7(), kind: "list", parentId: null, name: "Soon" };
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
