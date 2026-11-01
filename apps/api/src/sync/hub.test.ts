// The change bus and its streams over an in-memory change log (TS-23): replay after a cursor, live changes in
// order, recovery from gaps and slow clients by reading the log, `reset` for cursors it can't continue, and
// streams that end with their session.

import { describe, expect, test } from "bun:test";

import type { Change } from "@tonaris/domain";

import { type ChangeLog, createSyncHub, type SessionCheck, type SyncEvent } from "./hub";

const accountId = "anna";

function memoryLog() {
  let changes: Change[] = [];
  let head = 0;
  let reads = 0;
  let pause: Promise<void> | undefined;
  const log: ChangeLog = {
    async read(_, after, limit) {
      reads += 1;
      // What was committed when the read began, as a query's snapshot.
      const snapshot = changes.filter((change) => change.seq > after).slice(0, limit);
      await pause;
      return snapshot;
    },
    head: () => Promise.resolve(head),
  };
  return {
    log,
    /** Commits the next `count` changes, as executeMutation would, and returns them. */
    commit(count = 1): Change[] {
      const committed = Array.from({ length: count }, (): Change => {
        head += 1;
        return {
          seq: head,
          entity: "album",
          id: crypto.randomUUID(),
          op: "insert",
          data: null,
          mutationId: null,
        };
      });
      changes.push(...committed);
      return committed;
    },
    /** Forgets the changes up to `seq`, as the retention job does. */
    prune(seq: number) {
      changes = changes.filter((change) => change.seq > seq);
    },
    get reads() {
      return reads;
    },
    /** Holds every read until the returned function is called. */
    holdReads() {
      const { promise, resolve } = Promise.withResolvers<void>();
      pause = promise;
      return () => {
        pause = undefined;
        resolve();
      };
    },
  };
}

/** Takes `count` events from a stream, failing if they don't come within a second. */
async function take(
  stream: { next(): Promise<IteratorResult<SyncEvent, undefined>> },
  count: number,
) {
  const events: SyncEvent[] = [];
  const deadline = AbortSignal.timeout(1_000);
  while (events.length < count) {
    // oxlint-disable-next-line no-await-in-loop
    const next = await Promise.race([
      stream.next(),
      new Promise<never>((_, reject) => {
        deadline.addEventListener("abort", () => reject(new Error(`only ${events.length} events`)));
      }),
    ]);
    if (next.done) break;
    events.push(next.value);
  }
  return events;
}

const seqs = (events: SyncEvent[]) =>
  events.map((event) => (event.event === "change" ? event.data.seq : "reset"));

describe("owner streams (TS-23)", () => {
  test("replay the log after the cursor, then hand out live changes in order", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    memory.commit(3);
    const stream = hub.subscribe(accountId, 1);
    expect(seqs(await take(stream, 2))).toEqual([2, 3]);

    hub.publish(accountId, memory.commit(2));
    expect(seqs(await take(stream, 2))).toEqual([4, 5]);
    expect(memory.reads).toBe(1);
  });

  test("frame each change with its seq as the event id", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    const committed = memory.commit();
    const events = await take(hub.subscribe(accountId, 0), 1);
    expect(events).toEqual(
      committed.map((change) => ({ id: String(change.seq), event: "change", data: change })),
    );
  });

  test("skip changes they already handed out", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    const stream = hub.subscribe(accountId, 0);
    const committed = memory.commit(2);
    expect(seqs(await take(stream, 2))).toEqual([1, 2]);
    hub.publish(accountId, committed);
    hub.publish(accountId, memory.commit());
    expect(seqs(await take(stream, 1))).toEqual([3]);
  });

  test("read the log when a publish skips ahead, as when commits publish out of order", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    const stream = hub.subscribe(accountId, 0);
    const events = take(stream, 2);
    await Bun.sleep(5);
    const [first, second] = [memory.commit(), memory.commit()];
    hub.publish(accountId, second ?? []);
    hub.publish(accountId, first ?? []);
    expect(seqs(await events)).toEqual([1, 2]);
  });

  test("never lose what is published while they read the log", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    memory.commit(2);
    const release = memory.holdReads();
    const stream = hub.subscribe(accountId, 0);
    const reading = take(stream, 4);
    await Bun.sleep(10);
    hub.publish(accountId, memory.commit(2));
    release();
    expect(seqs(await reading)).toEqual([1, 2, 3, 4]);
  });

  test("hold no more than the buffer limit for a slow client, and catch up from the log", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log, bufferLimit: 5, pageSize: 4 });
    const stream = hub.subscribe(accountId, 0);
    const first = stream.next();
    await Bun.sleep(5);
    // Published faster than the client reads: more than the buffer holds.
    for (let index = 0; index < 20; index += 1) hub.publish(accountId, memory.commit());
    const events = [(await first).value, ...(await take(stream, 19))].filter(
      (event) => event !== undefined,
    );
    expect(seqs(events)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(memory.reads).toBeGreaterThan(2);
  });

  test("reset a cursor the log no longer reaches", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    memory.commit(5);
    memory.prune(3);
    const stream = hub.subscribe(accountId, 2);
    expect(await take(stream, 2)).toEqual([{ event: "reset", data: { reason: "cursor_expired" } }]);
    expect(hub.size).toBe(0);
  });

  test("reset a cursor ahead of the log, such as one from another database", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    memory.commit(2);
    expect(await take(hub.subscribe(accountId, 7), 2)).toEqual([
      { event: "reset", data: { reason: "cursor_unknown" } },
    ]);
  });

  test("continue a cursor at the head, even when the log before it is gone", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    memory.commit(3);
    memory.prune(3);
    const stream = hub.subscribe(accountId, 3);
    hub.publish(accountId, memory.commit());
    expect(seqs(await take(stream, 1))).toEqual([4]);
  });

  test("hand each account only its own changes", async () => {
    const anna = memoryLog();
    const hub = createSyncHub({ log: anna.log });
    const stream = hub.subscribe(accountId, 0);
    const events = take(stream, 1);
    await Bun.sleep(5);
    hub.publish("ben", [
      { seq: 1, entity: "album", id: "x", op: "insert", data: null, mutationId: null },
    ]);
    const [annas] = anna.commit();
    hub.publish(accountId, annas ? [annas] : []);
    const [event] = await events;
    expect(event?.event === "change" && event.data.id).toBe(annas?.id ?? "");
  });

  test("end a waiting reader at once and leave the hub", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    const stream = hub.subscribe(accountId, 0);
    const waiting = stream.next();
    await Bun.sleep(5);
    expect(hub.size).toBe(1);
    stream.end();
    expect(await waiting).toEqual({ done: true, value: undefined });
    expect(hub.size).toBe(0);
  });
});

/** A session check over a set of live sessions, counting its calls, which can be made to fail. */
function memorySessions(...live: string[]) {
  const active = new Set(live);
  let checks = 0;
  let failing = false;
  const sessions: SessionCheck = {
    active(ids) {
      checks += 1;
      if (failing) return Promise.reject(new Error("database unavailable"));
      return Promise.resolve(new Set(ids.filter((id) => active.has(id))));
    },
  };
  return {
    sessions,
    end: (id: string) => active.delete(id),
    fail: (on: boolean) => {
      failing = on;
    },
    get checks() {
      return checks;
    },
  };
}

describe("streams and their sessions (TS-23)", () => {
  test("a stream whose session ends stops at the next check, and the others go on", async () => {
    const memory = memoryLog();
    const live = memorySessions("web", "phone");
    const hub = createSyncHub({ log: memory.log, sessions: live.sessions, sessionCheckMs: 10 });
    const web = hub.subscribe(accountId, 0, "web");
    const phone = hub.subscribe(accountId, 0, "phone");
    const waiting = web.next();

    live.end("web");
    expect(await waiting).toEqual({ done: true, value: undefined });
    expect(hub.size).toBe(1);
    hub.publish(accountId, memory.commit());
    expect(seqs(await take(phone, 1))).toEqual([1]);
    hub.close();
  });

  test("endSessionsOf ends the account's streams at once, but the kept session's", async () => {
    const memory = memoryLog();
    const hub = createSyncHub({ log: memory.log });
    const first = hub.subscribe(accountId, 0, "web");
    hub.subscribe(accountId, 0, "phone");
    const kept = hub.subscribe(accountId, 0, "laptop");
    const otherAccount = hub.subscribe("ben", 0, "ben-web");
    const waiting = first.next();
    hub.endSessionsOf(accountId, "laptop");
    expect(await waiting).toEqual({ done: true, value: undefined });
    expect(hub.size).toBe(2);

    hub.endSessionsOf(accountId);
    expect(hub.size).toBe(1);
    kept.end();
    otherAccount.end();
  });

  test("check only while streams are open", async () => {
    const memory = memoryLog();
    const live = memorySessions("web");
    const hub = createSyncHub({ log: memory.log, sessions: live.sessions, sessionCheckMs: 5 });
    await Bun.sleep(30);
    expect(live.checks).toBe(0);

    const stream = hub.subscribe(accountId, 0, "web");
    await Bun.sleep(30);
    expect(live.checks).toBeGreaterThan(0);
    stream.end();
    const after = live.checks;
    await Bun.sleep(30);
    expect(live.checks).toBe(after);
  });

  test("keep the streams when a check fails", async () => {
    const memory = memoryLog();
    const live = memorySessions("web");
    const failures: unknown[] = [];
    const hub = createSyncHub({
      log: memory.log,
      sessions: live.sessions,
      sessionCheckMs: 5,
      logError: (error) => failures.push(error),
    });
    const stream = hub.subscribe(accountId, 0, "web");
    live.fail(true);
    live.end("web");
    await Bun.sleep(30);
    expect(failures.length).toBeGreaterThan(0);
    expect(hub.size).toBe(1);

    live.fail(false);
    expect(await take(stream, 1)).toEqual([]);
    expect(hub.size).toBe(0);
    hub.close();
  });
});
