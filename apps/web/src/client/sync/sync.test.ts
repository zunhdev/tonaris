// The sync client end to end (TON-20): TanStack DB collections in two sessions of one account, against the real
// API and Postgres in a child process, with the network failing on demand. FR-09 and FR-13 as a person sees them:
// optimistic writes that settle only once saved, conflicts kept for review, unconfirmed writes reconciled
// without duplicates, and streams that resume or start over.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { uuidv7, type Album } from "@tonaris/domain";

import type { SyncClient } from "./client";
import { startApiServer, testClient, until, type TestServer } from "./testing";
import { MutationRejected, type SaveState } from "./writer";

let server: TestServer;
const open: SyncClient[] = [];

beforeAll(async () => {
  server = await startApiServer(10);
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
