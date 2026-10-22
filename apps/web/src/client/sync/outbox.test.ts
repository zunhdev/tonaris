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
    const outbox = createOutbox({ send, persistence, tab: browser.tab("anna") });
    await outbox.adopt();
    await Bun.sleep(5);
    expect(sends).toEqual([]);
    expect(await persistence.entries()).toHaveLength(1);
  });
});
