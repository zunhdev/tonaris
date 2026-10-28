// The sync protocol's conformance suite (TS-28): the endpoints driven as any client would drive them, on a
// listening server and a fresh test schema. Bootstrap, write, stream, reconnect with a cursor, replay, conflict
// and reset; FR-09 and FR-13 as the server must keep them. A native client is checked against the same scenarios.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { changeLog, pruneSyncHistory } from "@tonaris/db";
import {
  appViewDefaults,
  batchResultSchema,
  bootstrapSchema,
  mutationResultSchema,
  syncRetentionMs,
  uuidv7,
  type Album,
  type Batch,
  type BatchItem,
  type BatchResult,
  type Bootstrap,
  type Change,
  type Container,
  type Mutation,
  type MutationResult,
  type ViewPrefs,
} from "@tonaris/domain";

import { createTestApp } from "../testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let base: string;

beforeEach(async () => {
  // Sessions are checked often, so a signed-out session's stream ends within a test.
  t = await createTestApp({ hub: { sessionCheckMs: 50 } });
  base = t.listen();
});

afterEach(async () => {
  await t.drop();
});

type StreamEvent = { id?: string; event?: string; data?: unknown };

/** Opens the owner stream and collects its events as they arrive. Bun has no EventSource, so this reads it. */
async function connect(cookie: string, cursor?: { lastEventId?: number; after?: number }) {
  const controller = new AbortController();
  const query = cursor?.after === undefined ? "" : `?after=${cursor.after}`;
  const response = await fetch(`${base}/v1/sync/stream${query}`, {
    headers: {
      cookie,
      ...(cursor?.lastEventId === undefined ? {} : { "last-event-id": String(cursor.lastEventId) }),
    },
    signal: controller.signal,
  });
  const events: StreamEvent[] = [];
  let ended = false;
  const reading = (async () => {
    if (!response.ok || !response.body) return;
    const decoder = new TextDecoder();
    let text = "";
    try {
      for await (const chunk of response.body) {
        text += decoder.decode(chunk, { stream: true });
        const blocks = text.split("\n\n");
        text = blocks.pop() ?? "";
        for (const block of blocks) {
          const event: StreamEvent = {};
          for (const line of block.split("\n")) {
            const [field, ...rest] = line.split(": ");
            const value = rest.join(": ");
            if (field === "id") event.id = value;
            if (field === "event") event.event = value;
            if (field === "data") event.data = JSON.parse(value);
          }
          if (event.event) events.push(event);
        }
      }
    } catch {
      // Aborted by the test.
    }
    ended = true;
  })();
  return {
    response,
    events,
    get ended() {
      return ended;
    },
    /** The `seq` of each change event so far. */
    seqs: () => events.filter((event) => event.event === "change").map((event) => Number(event.id)),
    async until(check: () => boolean, ms = 2_000) {
      const deadline = performance.now() + ms;
      while (!check()) {
        if (performance.now() > deadline) {
          throw new Error(`stream ${ended ? "ended" : "timed out"} with ${JSON.stringify(events)}`);
        }
        // oxlint-disable-next-line no-await-in-loop
        await Bun.sleep(5);
      }
    },
    close: async () => {
      controller.abort();
      await reading;
    },
    finished: reading,
  };
}

async function post(cookie: string, mutation: Mutation): Promise<MutationResult> {
  const response = await t.call("/v1/mutations", { json: mutation, headers: { cookie } });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json());
}

async function bootstrap(cookie: string): Promise<Bootstrap> {
  const response = await t.call("/v1/sync/bootstrap", { headers: { cookie } });
  expect(response.status).toBe(200);
  return bootstrapSchema.parse(await response.json());
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

const create = (args: Album = album()): Mutation => ({
  mutationId: uuidv7(),
  name: "album.create",
  args,
});

const retitle = (id: string, title: string, from: string): Mutation => ({
  mutationId: uuidv7(),
  name: "album.update",
  args: { id, title },
  base: { title: from },
});

describe("bootstrap, write and stream (TS-24, FR-09.1)", () => {
  test("a client bootstraps, writes, and receives its change from the bootstrap cursor", async () => {
    const anna = await t.signIn("anna@example.com");
    expect(await bootstrap(anna.cookie)).toEqual({
      seq: 0,
      albums: [],
      containers: [],
      memberships: [],
      links: [],
      fields: [],
      views: [],
      positions: [],
      defaults: appViewDefaults,
    });
    const stream = await connect(anna.cookie, { after: 0 });
    expect(stream.response.headers.get("content-type")).toBe("text/event-stream");

    const args = album();
    const mutation = create(args);
    expect(await post(anna.cookie, mutation)).toEqual({
      mutationId: mutation.mutationId,
      outcome: { status: "confirmed", seq: 1, result: null },
    });
    await stream.until(() => stream.events.length === 1);
    const change: Change = {
      seq: 1,
      entity: "album",
      id: args.id,
      op: "insert",
      data: args,
      mutationId: mutation.mutationId,
    };
    expect(stream.events).toEqual([{ id: "1", event: "change", data: change }]);
    expect(await bootstrap(anna.cookie)).toMatchObject({ seq: 1, albums: [args] });
    await stream.close();
  });

  test("every session of the account receives the change, and no other account does", async () => {
    const annaWeb = await t.signIn("anna@example.com");
    const annaPhone = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    expect(annaPhone.id).toBe(annaWeb.id);
    const [phone, bens] = await Promise.all([connect(annaPhone.cookie), connect(ben.cookie)]);

    await post(annaWeb.cookie, create());
    await phone.until(() => phone.events.length === 1);
    await post(ben.cookie, create());
    await bens.until(() => bens.events.length === 1);
    expect(phone.seqs()).toEqual([1]);
    expect(bens.seqs()).toEqual([1]);
    expect(bens.events[0]?.data).not.toEqual(phone.events[0]?.data);
    await Promise.all([phone.close(), bens.close()]);
  });

  test("a burst of concurrent writes from two sessions reaches each stream complete and in order", async () => {
    const one = await t.signIn("anna@example.com");
    const two = await t.signIn("anna@example.com");
    const streams = await Promise.all([connect(one.cookie), connect(two.cookie)]);

    await Promise.all(
      Array.from({ length: 30 }, (_, index) => post(index % 2 ? one.cookie : two.cookie, create())),
    );
    for (const stream of streams) {
      // oxlint-disable-next-line no-await-in-loop
      await stream.until(() => stream.events.length === 30);
      expect(stream.seqs()).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    }
    await Promise.all(streams.map((stream) => stream.close()));
  });
});

describe("retries and reconciliation (TS-22, FR-13.5)", () => {
  test("a mutation sent again gets the stored outcome and is applied once", async () => {
    const anna = await t.signIn("anna@example.com");
    const stream = await connect(anna.cookie);
    const mutation = create();
    const [first, second] = await Promise.all([
      post(anna.cookie, mutation),
      post(anna.cookie, mutation),
    ]);
    const third = await post(anna.cookie, mutation);
    expect(second).toEqual(first);
    expect(third).toEqual(first);

    await post(anna.cookie, create());
    await stream.until(() => stream.events.length === 2);
    expect(stream.seqs()).toEqual([1, 2]);
    expect((await bootstrap(anna.cookie)).albums).toHaveLength(2);
    await stream.close();
  });

  test("five copies sent at once apply once, and all report the same outcome", async () => {
    const anna = await t.signIn("anna@example.com");
    const stream = await connect(anna.cookie);
    const mutation = create();
    const results = await Promise.all(Array.from({ length: 5 }, () => post(anna.cookie, mutation)));
    for (const result of results) expect(result).toEqual(results[0]!);

    await post(anna.cookie, create());
    await stream.until(() => stream.events.length === 2);
    expect(stream.seqs()).toEqual([1, 2]);
    await stream.close();
  });

  test("an unanswered mutation is looked up by its ID; others' and unknown IDs aren't found", async () => {
    const anna = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    const mutation = create();
    const result = await post(anna.cookie, mutation);

    const found = await t.call(`/v1/mutations/${mutation.mutationId}`, {
      headers: { cookie: anna.cookie },
    });
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(result);
    for (const [cookie, id] of [
      [ben.cookie, mutation.mutationId],
      [anna.cookie, uuidv7()],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const missing = await t.call(`/v1/mutations/${id}`, { headers: { cookie } });
      expect(missing.status).toBe(404);
      // oxlint-disable-next-line no-await-in-loop
      expect(await missing.json()).toMatchObject({ code: "not_found" });
    }
  });

  test("a replay older than the idempotency records is expired, not run again", async () => {
    const anna = await t.signIn("anna@example.com");
    const old: Mutation = {
      ...create(),
      mutationId: uuidv7(Date.now() - syncRetentionMs - 60_000),
    };
    const result = await post(anna.cookie, old);
    expect(result.outcome).toMatchObject({
      status: "failed",
      code: "expired",
      problem: { status: 410 },
    });
    expect((await bootstrap(anna.cookie)).albums).toEqual([]);
  });
});

describe("conflicts (TS-21, FR-09.4)", () => {
  test("a stale edit keeps the newer value and reports current, attempted and base", async () => {
    const web = await t.signIn("anna@example.com");
    const phone = await t.signIn("anna@example.com");
    const args = album();
    await post(web.cookie, create(args));
    const stream = await connect(web.cookie, { lastEventId: 1 });

    expect((await post(web.cookie, retitle(args.id, "A", "Kind of Blue"))).outcome.status).toBe(
      "confirmed",
    );
    const stale = await post(phone.cookie, retitle(args.id, "B", "Kind of Blue"));
    expect(stale.outcome).toEqual({
      status: "conflict",
      conflicts: [{ field: "title", current: "A", attempted: "B", base: "Kind of Blue" }],
    });

    // Independent fields of the same album both succeed.
    const year: Mutation = {
      mutationId: uuidv7(),
      name: "album.update",
      args: { id: args.id, originalYear: 1960 },
      base: { originalYear: 1959 },
    };
    expect((await post(phone.cookie, year)).outcome.status).toBe("confirmed");

    await stream.until(() => stream.events.length === 2);
    expect(stream.events.map((event) => event.data)).toMatchObject([
      { seq: 2, op: "update", data: { title: "A", originalYear: 1959 } },
      { seq: 3, op: "update", data: { title: "A", originalYear: 1960 } },
    ]);
    expect((await bootstrap(web.cookie)).albums).toMatchObject([
      { title: "A", originalYear: 1960 },
    ]);
    await stream.close();
  });

  test("two sessions saving the same field at once: exactly one is saved, the other is a conflict", async () => {
    const web = await t.signIn("anna@example.com");
    const phone = await t.signIn("anna@example.com");
    const args = album();
    await post(web.cookie, create(args));

    const outcomes = await Promise.all([
      post(web.cookie, retitle(args.id, "From the web", "Kind of Blue")),
      post(phone.cookie, retitle(args.id, "From the phone", "Kind of Blue")),
    ]);
    const statuses = outcomes.map(({ outcome }) => outcome.status).toSorted();
    expect(statuses).toEqual(["confirmed", "conflict"]);
    const saved = (await bootstrap(web.cookie)).albums[0]?.title;
    const loser = outcomes.find(({ outcome }) => outcome.status === "conflict")?.outcome;
    expect(loser?.status === "conflict" && loser.conflicts[0]?.current).toBe(saved);
  });

  test("a rejected mutation changes nothing and sends nothing on the stream (X-05)", async () => {
    const anna = await t.signIn("anna@example.com");
    const stream = await connect(anna.cookie);
    const result = await post(anna.cookie, create(album({ artistCredit: "" })));
    expect(result.outcome).toMatchObject({
      status: "failed",
      code: "required_missing",
      problem: { status: 422, errors: [{ path: "artistCredit", message: "Required" }] },
    });
    await post(anna.cookie, create());
    await stream.until(() => stream.events.length === 1);
    expect(stream.seqs()).toEqual([1]);
    await stream.close();
  });
});

describe("reconnecting (TS-23)", () => {
  test("a stream resumes after Last-Event-ID with no gap and no repeat", async () => {
    const anna = await t.signIn("anna@example.com");
    const first = await connect(anna.cookie);
    await post(anna.cookie, create());
    await post(anna.cookie, create());
    await first.until(() => first.events.length === 2);
    await first.close();

    for (let index = 0; index < 3; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await post(anna.cookie, create());
    }
    const resumed = await connect(anna.cookie, { lastEventId: 2, after: 0 });
    await resumed.until(() => resumed.events.length === 3);
    await post(anna.cookie, create());
    await resumed.until(() => resumed.events.length === 4);
    expect(resumed.seqs()).toEqual([3, 4, 5, 6]);
    await resumed.close();
  });

  test("a cursor the log no longer reaches, or never had, gets reset and the stream ends", async () => {
    const anna = await t.signIn("anna@example.com");
    await post(anna.cookie, create());
    await post(anna.cookie, create());
    await t.db.update(changeLog).set({ createdAt: new Date(Date.now() - syncRetentionMs - 1_000) });
    await pruneSyncHistory(t.db);

    for (const [cursor, reason] of [
      [0, "cursor_expired"],
      [9, "cursor_unknown"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const stream = await connect(anna.cookie, { lastEventId: cursor });
      // oxlint-disable-next-line no-await-in-loop
      await stream.finished;
      expect(stream.events).toEqual([{ event: "reset", data: { reason } }]);
    }

    // After bootstrapping again, the new cursor streams normally.
    const { seq } = await bootstrap(anna.cookie);
    const stream = await connect(anna.cookie, { lastEventId: seq });
    await post(anna.cookie, create());
    await stream.until(() => stream.events.length === 1);
    expect(stream.seqs()).toEqual([3]);
    await stream.close();
  });

  test("signing out ends that session's stream, and its reconnect is refused", async () => {
    const web = await t.signIn("anna@example.com");
    const phone = await t.signIn("anna@example.com");
    const leaving = await connect(web.cookie);
    const staying = await connect(phone.cookie);

    const signedOut = await t.call("/auth/sign-out", { json: {}, headers: { cookie: web.cookie } });
    expect(signedOut.status).toBe(200);
    await leaving.until(() => leaving.ended);
    expect((await connect(web.cookie)).response.status).toBe(401);

    await post(phone.cookie, create());
    await staying.until(() => staying.seqs().length === 1);
    expect(staying.ended).toBe(false);
    await staying.close();
  });

  test("shutting down ends every stream, so clients reconnect to the next instance", async () => {
    const anna = await t.signIn("anna@example.com");
    const streams = await Promise.all([connect(anna.cookie), connect(anna.cookie)]);
    await Bun.sleep(20);
    expect(t.hub.size).toBe(2);
    t.hub.close();
    await Promise.all(streams.map((stream) => stream.finished));
    expect(streams.every((stream) => stream.ended)).toBe(true);
    expect(t.hub.size).toBe(0);
  });
});

const node = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({
  id: uuidv7(),
  kind,
  parentId,
  name,
});
const createContainer = (args: Container): Mutation => ({
  mutationId: uuidv7(),
  name: "container.create",
  args,
});

const move = (id: string, parentId: string | null, from: string | null): Mutation => ({
  mutationId: uuidv7(),
  name: "container.move",
  args: { id, parentId },
  base: { parentId: from },
});

describe("folders and lists (FR-01.1–FR-01.5)", () => {
  test("creates, renames and moves reach every session's stream and the next bootstrap", async () => {
    const anna = await t.signIn("anna@example.com");
    const other = await t.signIn("anna@example.com");
    const stream = await connect(other.cookie, { after: 0 });

    const jazz = node("folder", "Jazz");
    const favorites = node("list", "Favorites");
    for (const each of [jazz, favorites]) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await post(anna.cookie, createContainer(each))).outcome.status).toBe("confirmed");
    }
    const renamed = await post(anna.cookie, {
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id: favorites.id, name: "Desert island" },
      base: { name: "Favorites" },
    });
    const moved = await post(anna.cookie, {
      mutationId: uuidv7(),
      name: "container.move",
      args: { id: favorites.id, parentId: jazz.id },
      base: { parentId: null },
    });
    expect(renamed.outcome).toEqual({ status: "confirmed", seq: 3, result: null });
    expect(moved.outcome).toEqual({ status: "confirmed", seq: 4, result: null });

    await stream.until(() => stream.seqs().length === 4);
    expect(stream.events.map((event) => event.data)).toEqual([
      expect.objectContaining({ entity: "container", op: "insert", data: jazz }),
      expect.objectContaining({ entity: "container", op: "insert", data: favorites }),
      expect.objectContaining({ op: "update", data: { ...favorites, name: "Desert island" } }),
      expect.objectContaining({
        op: "update",
        data: { ...favorites, name: "Desert island", parentId: jazz.id },
      }),
    ]);
    await stream.close();

    const snapshot = await bootstrap(anna.cookie);
    expect(snapshot.seq).toBe(4);
    expect(snapshot.containers).toEqual(
      expect.arrayContaining([jazz, { ...favorites, name: "Desert island", parentId: jazz.id }]),
    );
  });

  test("each rejection has its code, changes nothing and sends nothing", async () => {
    const anna = await t.signIn("anna@example.com");
    const jazz = node("folder", "Jazz");
    const bebop = node("folder", "Bebop", jazz.id);
    const later = node("list", "Later");
    for (const each of [jazz, bebop, later]) {
      // oxlint-disable-next-line no-await-in-loop
      await post(anna.cookie, createContainer(each));
    }
    const stream = await connect(anna.cookie, { after: 3 });

    const outcomes = await Promise.all(
      [
        createContainer(node("list", "jazz")),
        move(jazz.id, bebop.id, null),
        move(jazz.id, later.id, null),
        move(bebop.id, jazz.id, uuidv7()),
      ].map((mutation) => post(anna.cookie, mutation)),
    );
    expect(
      outcomes.map(({ outcome }) => (outcome.status === "failed" ? outcome.code : outcome.status)),
    ).toEqual(["name_conflict", "cycle", "invalid_destination", "conflict"]);
    // 32 levels of folders: an empty folder moved into the last would be at 33.
    const deep = Array.from({ length: 32 }, () => uuidv7());
    let parentId: string | null = null;
    for (const id of deep) {
      // oxlint-disable-next-line no-await-in-loop
      await post(anna.cookie, createContainer({ id, kind: "folder", parentId, name: "Level" }));
      parentId = id;
    }
    const tooDeep = await post(anna.cookie, move(bebop.id, deep.at(-1)!, jazz.id));
    expect(tooDeep.outcome).toMatchObject({ status: "failed", code: "limit_exceeded" });

    const snapshot = await bootstrap(anna.cookie);
    expect(snapshot.containers).toEqual(expect.arrayContaining([jazz, bebop, later]));
    expect(snapshot.seq).toBe(3 + deep.length);
    await stream.until(() => stream.seqs().length === deep.length);
    expect(JSON.stringify(stream.events)).not.toContain(bebop.id);
    await stream.close();
  });

  test("another account's folder can't be renamed or moved", async () => {
    const anna = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    const jazz = node("folder", "Jazz");
    await post(anna.cookie, createContainer(jazz));
    const result = await post(ben.cookie, {
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id: jazz.id, name: "Mine" },
      base: { name: "Jazz" },
    });
    expect(result.outcome).toMatchObject({ status: "failed", code: "permission_denied" });
    expect((await bootstrap(anna.cookie)).containers).toEqual([jazz]);
  });
});

const entry = (
  name: "membership.add" | "membership.remove",
  listId: string,
  albumId: string,
): Mutation => ({ mutationId: uuidv7(), name, args: { listId, albumId } });

describe("list entries (FR-01.6–FR-01.8)", () => {
  test("an add, a re-add and a remove reach every session's stream and the next bootstrap", async () => {
    const anna = await t.signIn("anna@example.com");
    const other = await t.signIn("anna@example.com");
    const kindOfBlue = album();
    const favorites = node("list", "Favorites");
    await post(anna.cookie, create(kindOfBlue));
    await post(anna.cookie, createContainer(favorites));
    const stream = await connect(other.cookie, { after: 2 });

    const added = await post(anna.cookie, entry("membership.add", favorites.id, kindOfBlue.id));
    const again = await post(anna.cookie, entry("membership.add", favorites.id, kindOfBlue.id));
    expect(added.outcome).toEqual({
      status: "confirmed",
      seq: 3,
      result: { alreadyInList: false },
    });
    expect(again.outcome).toEqual({ status: "confirmed", seq: 3, result: { alreadyInList: true } });
    const listed = await bootstrap(anna.cookie);
    expect(listed.memberships).toEqual([
      { listId: favorites.id, albumId: kindOfBlue.id, addedAt: expect.any(String) },
    ]);

    const removed = await post(
      anna.cookie,
      entry("membership.remove", favorites.id, kindOfBlue.id),
    );
    // The entry's delete, then the album entering Unsorted at the top (DS-51).
    expect(removed.outcome).toEqual({ status: "confirmed", seq: 5, result: null });
    await stream.until(() => stream.seqs().length === 3);
    const key = `${favorites.id}:${kindOfBlue.id}`;
    expect(stream.events.map((event) => event.data)).toEqual([
      expect.objectContaining({
        entity: "membership",
        id: key,
        op: "insert",
        data: listed.memberships[0],
      }),
      expect.objectContaining({ entity: "membership", id: key, op: "delete", data: null }),
      expect.objectContaining({
        entity: "position",
        id: `unsorted:${kindOfBlue.id}`,
        op: "insert",
      }),
    ]);
    await stream.close();

    const snapshot = await bootstrap(anna.cookie);
    expect(snapshot.seq).toBe(5);
    expect(snapshot.memberships).toEqual([]);
    expect(snapshot.albums).toEqual([kindOfBlue]);
  });

  test("each rejection has its code, changes nothing and sends nothing", async () => {
    const anna = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    const kindOfBlue = album();
    const bensAlbum = album({ title: "Debut" });
    const jazz = node("folder", "Jazz");
    const favorites = node("list", "Favorites");
    for (const mutation of [
      create(kindOfBlue),
      createContainer(jazz),
      createContainer(favorites),
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      await post(anna.cookie, mutation);
    }
    await post(ben.cookie, create(bensAlbum));
    const stream = await connect(anna.cookie, { after: 3 });

    const outcomes = await Promise.all([
      post(anna.cookie, entry("membership.add", jazz.id, kindOfBlue.id)),
      post(anna.cookie, entry("membership.add", favorites.id, bensAlbum.id)),
      post(ben.cookie, entry("membership.add", favorites.id, bensAlbum.id)),
    ]);
    expect(
      outcomes.map(({ outcome }) => (outcome.status === "failed" ? outcome.code : outcome.status)),
    ).toEqual(["invalid_destination", "not_found", "permission_denied"]);

    // A later change arrives first on the stream: the rejections sent nothing.
    await post(anna.cookie, entry("membership.add", favorites.id, kindOfBlue.id));
    await stream.until(() => stream.seqs().length === 1);
    expect(stream.seqs()).toEqual([4]);
    await stream.close();
    expect((await bootstrap(anna.cookie)).memberships).toEqual([
      expect.objectContaining({ listId: favorites.id, albumId: kindOfBlue.id }),
    ]);
    expect((await bootstrap(ben.cookie)).memberships).toEqual([]);
  });
});

async function postBatch(cookie: string, batch: Batch): Promise<BatchResult> {
  const response = await t.call("/v1/batches", { json: batch, headers: { cookie } });
  expect(response.status).toBe(200);
  return batchResultSchema.parse(await response.json());
}

const batchOf = (...items: Batch["items"]): Batch => ({ batchId: uuidv7(), items });
const after = (item: Mutation, prerequisite: Mutation): BatchItem => ({
  ...item,
  dependsOn: [prerequisite.mutationId],
});

/** Each item's status, or its error code when it failed. */
const statusesOf = ({ items }: BatchResult) =>
  items.map(({ outcome }) => (outcome.status === "failed" ? outcome.code : outcome.status));

describe("view choices and defaults (FR-11.7, FR-11.8, FR-09.2)", () => {
  test("a choice and a default reach the person's other session and the next bootstrap, and nobody else's", async () => {
    const anna = await t.signIn("anna@example.com");
    const other = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    const doom = node("list", "Doom");
    await post(anna.cookie, createContainer(doom));
    const stream = await connect(other.cookie, { after: 1 });
    const bens = await connect(ben.cookie, { after: 0 });

    const sorted = await post(anna.cookie, {
      mutationId: uuidv7(),
      name: "view.set",
      args: { viewKey: doom.id, sortMode: "name", sortDir: "desc" },
      base: { sortMode: null, sortDir: null },
    });
    expect(sorted.outcome).toEqual({ status: "confirmed", seq: 2, result: null });
    const defaulted = await post(anna.cookie, {
      mutationId: uuidv7(),
      name: "defaults.set",
      args: { layout: "grid" },
      base: { layout: "rows" },
    });
    expect(defaulted.outcome).toEqual({ status: "confirmed", seq: 3, result: null });

    await stream.until(() => stream.seqs().length === 2);
    const prefs: ViewPrefs = {
      viewKey: doom.id,
      sortMode: "name",
      sortDir: "desc",
      grouped: null,
      layout: null,
    };
    expect(stream.events.map((event) => event.data)).toEqual([
      expect.objectContaining({ entity: "view", id: doom.id, op: "insert", data: prefs }),
      expect.objectContaining({
        entity: "defaults",
        op: "update",
        data: expect.objectContaining({ layout: "grid" }),
      }),
    ]);
    await stream.close();
    await bens.close();
    expect(bens.seqs()).toEqual([]);

    const snapshot = await bootstrap(anna.cookie);
    expect(snapshot.views).toEqual([prefs]);
    expect(snapshot.defaults.layout).toBe("grid");
    expect((await bootstrap(ben.cookie)).defaults.layout).toBe("rows");
  });

  test("another person's list can't take a choice", async () => {
    const anna = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    const doom = node("list", "Doom");
    await post(anna.cookie, createContainer(doom));
    const refused = await post(ben.cookie, {
      mutationId: uuidv7(),
      name: "view.set",
      args: { viewKey: doom.id, layout: "grid" },
      base: { layout: null },
    });
    expect(refused.outcome).toMatchObject({ status: "failed", code: "not_found" });
    expect((await bootstrap(ben.cookie)).views).toEqual([]);
  });
});

describe("manual order (TS-16, FR-05.2, FR-09.4)", () => {
  test("a move reaches the person's other session; the same item moved from a stale place is a conflict", async () => {
    const anna = await t.signIn("anna@example.com");
    const other = await t.signIn("anna@example.com");
    const later = node("list", "Later");
    const doom = node("list", "Doom");
    await post(anna.cookie, createContainer(later));
    await post(anna.cookie, createContainer(doom));
    const stream = await connect(other.cookie, { after: 2 });

    const moved = await post(anna.cookie, {
      mutationId: uuidv7(),
      name: "order.set",
      args: { viewKey: "root", keys: { [doom.id]: "Zz" } },
      base: { [doom.id]: null },
    });
    expect(moved.outcome).toEqual({ status: "confirmed", seq: 3, result: null });
    await stream.until(() => stream.seqs().length === 1);
    const place = { viewKey: "root", itemId: doom.id, key: "Zz" };
    expect(stream.events[0]?.data).toEqual(
      expect.objectContaining({
        entity: "position",
        id: `root:${doom.id}`,
        op: "insert",
        data: place,
      }),
    );
    await stream.close();

    const stale = await post(other.cookie, {
      mutationId: uuidv7(),
      name: "order.set",
      args: { viewKey: "root", keys: { [doom.id]: "a1" } },
      base: { [doom.id]: null },
    });
    expect(stale.outcome).toEqual({
      status: "conflict",
      conflicts: [{ field: doom.id, current: "Zz", attempted: "a1", base: null }],
    });
    const different = await post(other.cookie, {
      mutationId: uuidv7(),
      name: "order.set",
      args: { viewKey: "root", keys: { [later.id]: "a1" } },
      base: { [later.id]: null },
    });
    expect(different.outcome.status).toBe("confirmed");
    expect((await bootstrap(anna.cookie)).positions).toHaveLength(2);
  });
});

describe("batches (TS-25, FR-13.4)", () => {
  test("a partial batch keeps its successes, and its changes reach another session", async () => {
    const anna = await t.signIn("anna@example.com");
    const other = await t.signIn("anna@example.com");
    await post(anna.cookie, createContainer(node("list", "Taken")));
    const stream = await connect(other.cookie, { after: 1 });

    const sent = batchOf(
      createContainer(node("list", "First")),
      createContainer(node("list", "TAKEN")),
      createContainer(node("list", "Third")),
    );
    const result = await postBatch(anna.cookie, sent);
    expect(result.batchId).toBe(sent.batchId);
    expect(result.items.map(({ mutationId }) => mutationId)).toEqual(
      sent.items.map(({ mutationId }) => mutationId),
    );
    expect(statusesOf(result)).toEqual(["confirmed", "name_conflict", "confirmed"]);

    await stream.until(() => stream.seqs().length === 2);
    expect(stream.events.map((event) => event.data)).toEqual([
      expect.objectContaining({
        seq: 2,
        entity: "container",
        data: expect.objectContaining({ name: "First" }),
      }),
      expect.objectContaining({
        seq: 3,
        entity: "container",
        data: expect.objectContaining({ name: "Third" }),
      }),
    ]);
    await stream.close();
    expect((await bootstrap(anna.cookie)).containers.map(({ name }) => name).toSorted()).toEqual([
      "First",
      "Taken",
      "Third",
    ]);
  });

  test("an invalid item fails on its own, and the others run", async () => {
    const anna = await t.signIn("anna@example.com");
    const unknown = { mutationId: uuidv7(), name: "album.delete", args: {} };
    const result = await postBatch(
      anna.cookie,
      batchOf(create(), unknown, create(album({ title: "Blue Train" }))),
    );
    expect(statusesOf(result)).toEqual(["confirmed", "validation_failed", "confirmed"]);
    expect(result.items[1]?.outcome).toMatchObject({ problem: { status: 422 } });
    expect((await bootstrap(anna.cookie)).albums).toHaveLength(2);
  });

  test("an addition waits for its list: skipped when the create fails, run when it succeeds", async () => {
    const anna = await t.signIn("anna@example.com");
    const kindOfBlue = album();
    await post(anna.cookie, create(kindOfBlue));

    const blank = node("list", " ");
    const failing = createContainer(blank);
    const skipped = await postBatch(
      anna.cookie,
      batchOf(failing, after(entry("membership.add", blank.id, kindOfBlue.id), failing)),
    );
    expect(skipped.items[1]?.outcome).toEqual({
      status: "skipped",
      dependsOn: failing.mutationId,
      because: "failed",
    });

    const favorites = node("list", "Favorites");
    const creating = createContainer(favorites);
    const added = await postBatch(
      anna.cookie,
      batchOf(creating, after(entry("membership.add", favorites.id, kindOfBlue.id), creating)),
    );
    expect(statusesOf(added)).toEqual(["confirmed", "confirmed"]);
    expect((await bootstrap(anna.cookie)).memberships).toEqual([
      expect.objectContaining({ listId: favorites.id, albumId: kindOfBlue.id }),
    ]);
  });

  test("an item follows the same rules as on its own", async () => {
    const anna = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    const bensList = node("list", "Ben's");
    await post(ben.cookie, createContainer(bensList));
    const kindOfBlue = album();
    await post(anna.cookie, create(kindOfBlue));

    const result = await postBatch(
      anna.cookie,
      batchOf(entry("membership.add", bensList.id, kindOfBlue.id)),
    );
    expect(statusesOf(result)).toEqual(["permission_denied"]);
  });

  test("a batch sent again replays every outcome and applies nothing twice", async () => {
    const anna = await t.signIn("anna@example.com");
    const sent = batchOf(create(), createContainer(node("list", "Favorites")));
    const first = await postBatch(anna.cookie, sent);
    const again = await postBatch(anna.cookie, sent);
    expect(again).toEqual(first);
    const snapshot = await bootstrap(anna.cookie);
    expect(snapshot.seq).toBe(2);
    expect([snapshot.albums.length, snapshot.containers.length]).toEqual([1, 1]);
  });

  test("an empty or oversized batch, or one that repeats an ID, is refused and runs nothing", async () => {
    const anna = await t.signIn("anna@example.com");
    const item = create();
    const refused = [
      batchOf(),
      batchOf(...Array.from({ length: 201 }, () => create())),
      batchOf(item, { ...create(), mutationId: item.mutationId }),
    ];
    for (const json of refused) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await t.call("/v1/batches", { json, headers: { cookie: anna.cookie } });
      expect(response.status).toBe(422);
      // oxlint-disable-next-line no-await-in-loop
      expect(await response.json()).toMatchObject({ code: "validation_failed" });
    }
    expect((await bootstrap(anna.cookie)).seq).toBe(0);
  });
});

describe("refusals", () => {
  test("signed-out clients get 401 problems from every sync endpoint", async () => {
    const responses = await Promise.all([
      fetch(`${base}/v1/sync/stream`),
      t.call("/v1/sync/bootstrap"),
      t.call("/v1/mutations", { json: create() }),
      t.call("/v1/batches", { json: batchOf(create()) }),
      t.call(`/v1/mutations/${uuidv7()}`),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      // oxlint-disable-next-line no-await-in-loop
      expect(await response.json()).toMatchObject({ code: "unauthenticated" });
    }
  });

  test("a malformed envelope or cursor is a validation problem", async () => {
    const anna = await t.signIn("anna@example.com");
    const v4 = { ...create(), mutationId: crypto.randomUUID() };
    const unknown = { mutationId: uuidv7(), name: "album.delete", args: {} };
    for (const json of [v4, unknown, { ...create(), args: { title: 5 } }]) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await t.call("/v1/mutations", { json, headers: { cookie: anna.cookie } });
      expect(response.status).toBe(422);
      // oxlint-disable-next-line no-await-in-loop
      expect(await response.json()).toMatchObject({ code: "validation_failed" });
    }
    const stream = await fetch(`${base}/v1/sync/stream`, {
      headers: { cookie: anna.cookie, "last-event-id": "-1" },
    });
    expect(stream.status).toBe(422);
  });
});
