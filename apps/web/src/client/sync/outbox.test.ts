// The outbox (TS-22, TS-25) with a stub in place of the network: one entry per transaction, sent in order and again
// until answered, batches split at 200, entries kept in the browser until answered, and a gone tab's entries
// adopted and sent first.

import { describe, expect, test } from "bun:test";

import { uuidv7, type Mutation, type Outcome } from "@tonaris/domain";

import { createOutbox, type QueuedState, type Sent } from "./outbox";
import { memoryPersistence, type OutboxEntry, type OutboxItem } from "./persistence";
import { memoryBrowser } from "./tabs";

const item = (title: string): OutboxItem => {
  const id = uuidv7();
  const mutation: Mutation = {
    mutationId: uuidv7(),
    name: "album.update",
    args: { id, title },
    base: { title: "before" },
  };
  return { mutation, key: id };
};

const confirmed = (seq: number): Outcome => ({ status: "confirmed", seq, result: null });

/** A send that answers each entry with confirmed outcomes, after `unanswered` sends without an answer. */
function stubSend(unanswered = 0) {
  const sends: OutboxEntry[] = [];
  let seq = 0;
  const send = (entry: OutboxEntry): Promise<Sent> => {
    sends.push(entry);
    if (unanswered > 0) {
      unanswered -= 1;
      return Promise.resolve({ unanswered: new TypeError("Failed to fetch") });
    }
    return Promise.resolve({ answered: entry.items.map(() => confirmed((seq += 1))) });
  };
  return { send, sends };
}

describe("outbox (TS-22)", () => {
  test("sends one entry at a time, and holds later ones behind an unanswered one", async () => {
    const { send, sends } = stubSend(2);
    const outbox = createOutbox({ send, backoff: { minMs: 1, maxMs: 5 } });
    const [first, second] = [item("A"), item("B")];
    const outcomes = await Promise.all([outbox.enqueue([first]), outbox.enqueue([second])]);

    expect(sends.map((entry) => entry.items[0]?.mutation.mutationId)).toEqual([
      first.mutation.mutationId,
      first.mutation.mutationId,
      first.mutation.mutationId,
      second.mutation.mutationId,
    ]);
    expect(outcomes).toEqual([[confirmed(1)], [confirmed(2)]]);
    expect(outbox.queued).toEqual([]);
  });

  test("sends a transaction's writes as one entry, and splits more than 200", async () => {
    const { send, sends } = stubSend();
    const outbox = createOutbox({ send });
    const three = [item("A"), item("B"), item("C")];
    expect(await outbox.enqueue(three)).toEqual([confirmed(1), confirmed(2), confirmed(3)]);
    expect(sends.map((entry) => entry.items.length)).toEqual([3]);

    const many = Array.from({ length: 201 }, (_, index) => item(`T${index}`));
    expect(await outbox.enqueue(many)).toHaveLength(201);
    expect(sends.slice(1).map((entry) => entry.items.length)).toEqual([200, 1]);
  });

  test("reports pending, then unconfirmed for a send without an answer", async () => {
    const states: QueuedState[] = [];
    const { send } = stubSend(1);
    const outbox = createOutbox({
      send,
      backoff: { minMs: 1, maxMs: 5 },
      onState: (_, state) => states.push(state),
    });
    await outbox.enqueue([item("A")]);
    expect(states).toEqual(["pending", "unconfirmed"]);
  });

  test("retries at once when woken, rather than waiting out the backoff", async () => {
    const { send } = stubSend(1);
    const outbox = createOutbox({ send, backoff: { minMs: 60_000, maxMs: 60_000 } });
    const outcome = outbox.enqueue([item("A")]);
    await Bun.sleep(10);
    outbox.wake();
    expect(await outcome).toEqual([confirmed(1)]);
  });

  test("keeps an entry in the browser until it is answered", async () => {
    const persistence = memoryPersistence();
    const { send } = stubSend(1);
    const outbox = createOutbox({ send, persistence, backoff: { minMs: 60_000, maxMs: 60_000 } });
    const outcome = outbox.enqueue([item("A")]);
    await Bun.sleep(10);
    expect(await persistence.entries()).toHaveLength(1);
    outbox.wake();
    await outcome;
    await Bun.sleep(1);
    expect(await persistence.entries()).toEqual([]);
  });
});

describe("adoption (TS-22, TS-23)", () => {
  test("a gone tab's entries are sent first, in order, as unconfirmed", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const gone = browser.tab("anna");
    const [a, b] = [item("A"), item("B")];
    // B was made before A.
    const entryA: OutboxEntry = { id: uuidv7(), tab: gone.id, createdAt: 10, items: [a] };
    const entryB: OutboxEntry = { id: uuidv7(), tab: gone.id, createdAt: 9, items: [b] };
    const left = [entryA, entryB];
    await Promise.all(left.map((entry) => persistence.putEntry(entry)));
    gone.close();

    const states: QueuedState[] = [];
    const adopted: OutboxEntry[] = [];
    const { send, sends } = stubSend();
    const outbox = createOutbox({
      send,
      persistence,
      tab: browser.tab("anna"),
      onState: (_, state) => states.push(state),
      onAdopted: (entry) => adopted.push(entry),
    });
    await outbox.adopt();
    const mine = item("C");
    await outbox.enqueue([mine]);

    expect(sends.map((entry) => entry.items[0]?.key)).toEqual([b.key, a.key, mine.key]);
    expect(adopted.map((entry) => entry.id)).toEqual([entryB.id, entryA.id]);
    expect(states.slice(0, 2)).toEqual(["unconfirmed", "unconfirmed"]);
    expect(await persistence.entries()).toEqual([]);
  });

  test("a live tab's entries stay with it", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const live = browser.tab("anna");
    await persistence.putEntry({ id: uuidv7(), tab: live.id, createdAt: 1, items: [item("A")] });
    await Bun.sleep(1);

    const { send, sends } = stubSend();
    const outbox = createOutbox({
      send,
      persistence,
      tab: browser.tab("anna"),
      adoptRetriesMs: [1, 1],
    });
    await outbox.adopt();
    await Bun.sleep(10);
    expect(sends).toEqual([]);
    expect(await persistence.entries()).toHaveLength(1);
  });

  test("a tab still holding its lock is adopted the moment it lets go, without another look (TON-137)", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const old = browser.tab("anna");
    const a = item("A");
    await persistence.putEntry({ id: uuidv7(), tab: old.id, createdAt: 1, items: [a] });
    await Bun.sleep(1);

    const adopted: OutboxEntry[] = [];
    const { send, sends } = stubSend();
    const outbox = createOutbox({
      send,
      persistence,
      tab: browser.tab("anna"),
      // No later looks: only the wait on its lock can adopt it.
      adoptRetriesMs: [],
      onAdopted: (entry) => adopted.push(entry),
    });
    await outbox.adopt();
    await Bun.sleep(10);
    expect(sends).toEqual([]);

    old.close();
    await Bun.sleep(10);
    expect(sends.map((entry) => entry.items[0]?.key)).toEqual([a.key]);
    expect(adopted).toHaveLength(1);
  });

  test("a reloaded tab still letting go of its lock is adopted on a later look (TON-102)", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const old = browser.tab("anna");
    const a = item("A");
    await persistence.putEntry({ id: uuidv7(), tab: old.id, createdAt: 1, items: [a] });

    const { send, sends } = stubSend();
    const outbox = createOutbox({
      send,
      persistence,
      tab: browser.tab("anna"),
      adoptRetriesMs: [5, 5, 5],
    });
    // The new page looks before the old one's lock is gone.
    await outbox.adopt();
    expect(sends).toEqual([]);
    old.close();
    await Bun.sleep(30);
    expect(sends.map((entry) => entry.items[0]?.key)).toEqual([a.key]);
    expect(await persistence.entries()).toEqual([]);
  });
});

describe("lanes (TON-45)", () => {
  test("a gone tab's entries are adopted by the outbox of their own lane", async () => {
    const browser = memoryBrowser();
    const persistence = memoryPersistence();
    const gone = browser.tab("anna");
    const [edit, capture] = [item("A"), item("B")];
    await persistence.putEntry({ id: uuidv7(), tab: gone.id, createdAt: 1, items: [edit] });
    await persistence.putEntry({
      id: uuidv7(),
      tab: gone.id,
      lane: "capture",
      createdAt: 2,
      items: [capture],
    });
    gone.close();

    const tab = browser.tab("anna");
    const main = stubSend();
    const captures = stubSend();
    const outbox = createOutbox({ send: main.send, persistence, tab });
    const captureLane = createOutbox({ send: captures.send, persistence, tab, lane: "capture" });
    // One after the other: a gone tab's lock is taken only when free.
    await outbox.adopt();
    await captureLane.adopt();
    await Bun.sleep(5);
    expect(main.sends.map((entry) => entry.items[0]?.key)).toEqual([edit.key]);
    expect(captures.sends.map((entry) => entry.items[0]?.key)).toEqual([capture.key]);
    expect(captures.sends[0]?.lane).toBe("capture");
  });

  test("an entry waits for the main lane's earlier entries, and the main lane never waits for it", async () => {
    const order: string[] = [];
    const { promise: held, resolve: releaseFirst } = Promise.withResolvers<void>();
    let sends = 0;
    const main = createOutbox({
      send: async (entry) => {
        sends += 1;
        // The first main entry is held until the capture would have gone.
        if (sends === 1) await held;
        order.push(entry.items[0]?.key ?? "");
        return { answered: entry.items.map(() => confirmed(sends)) };
      },
    });
    const captureLane = createOutbox({
      lane: "capture",
      send: async (entry) => {
        await main.answeredBefore(entry.createdAt);
        order.push(entry.items[0]?.key ?? "");
        return { answered: entry.items.map(() => confirmed(0)) };
      },
    });
    const [list, capture, rename] = [item("list"), item("capture"), item("rename")];
    const sent = main.enqueue([list]);
    await Bun.sleep(2);
    const captured = captureLane.enqueue([capture]);
    await Bun.sleep(2);
    // A main entry made after the capture: it waits for the held one only.
    const renamed = main.enqueue([rename]);
    await Bun.sleep(5);
    expect(order).toEqual([]);
    releaseFirst();
    await Promise.all([sent, captured, renamed]);
    expect(order.indexOf(list.key)).toBeLessThan(order.indexOf(capture.key));
    expect(order).toContain(rename.key);
  });

  test("a main entry is answered while a capture is still running", async () => {
    const { promise: running, resolve: finish } = Promise.withResolvers<void>();
    const main = createOutbox({ send: stubSend().send });
    const captureLane = createOutbox({
      lane: "capture",
      send: async (entry) => {
        await running;
        return { answered: entry.items.map(() => confirmed(0)) };
      },
    });
    const captured = captureLane.enqueue([item("capture")]);
    expect(await main.enqueue([item("rename")])).toEqual([confirmed(1)]);
    finish();
    await captured;
  });
});
