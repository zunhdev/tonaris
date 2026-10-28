// The client's outbox (TS-22): writes go to the server one entry at a time, in the order they were made, so a
// later change never overtakes the one it depends on (create a list, then add to it). An entry is one transaction's
// writes: one goes to POST /v1/mutations, several to POST /v1/batches (TS-25). An entry sent without an answer is
// unconfirmed: the outbox keeps it at the head and sends the same envelopes again, after a backoff or as soon as
// the connection is back. The server applies them once or returns the stored outcomes, so the retry is how an
// unconfirmed outcome is reconciled (FR-13.5).
// Entries are kept in the browser until answered, owned by this tab. A reloaded or closed tab's entries are adopted
// by another tab of the account, which sends them on (`adopt`), so a reload loses no write.
// An outbox is one lane. Captures, which can take a minute, have a lane of their own, so they never hold up the
// edits made after them; a capture's entry waits for the main lane's entries made before it (`answeredBefore`), so
// it never overtakes what it depends on either (TON-45).

import { maxBatchItems, uuidv7, type Mutation, type Outcome } from "@tonaris/domain";

import type { OutboxEntry, OutboxItem, SyncPersistence } from "./persistence";
import type { TabCoordinator } from "./tabs";

/** What sending an entry gave: each item's outcome, in order, or no answer (a network error, a timeout, a 5xx). */
export type Sent = { answered: Outcome[] } | { unanswered: unknown };

/** `pending` while queued or in flight; `unconfirmed` once a send went unanswered, or after adoption. */
export type QueuedState = "pending" | "unconfirmed";

export type OutboxOptions = {
  send: (entry: OutboxEntry) => Promise<Sent>;
  /** The lane its entries are kept under, such as `capture`; none for the main lane. */
  lane?: string;
  /** Where entries are kept until answered; without it, a reload loses them. */
  persistence?: SyncPersistence;
  /** This tab, which owns new entries and adopts gone tabs' (TS-23). */
  tab?: Pick<TabCoordinator, "id" | "adopt">;
  /** Delays between sends of an unanswered entry: full jitter up to an exponential cap. */
  backoff?: { minMs: number; maxMs: number };
  onState?: (mutation: Mutation, state: QueuedState) => void;
  /** An entry adopted from a gone tab, with its outcomes once answered. */
  onAdopted?: (entry: OutboxEntry, outcomes: Promise<Outcome[]>) => void;
  /** Gets a failure to read or write the kept entries; sending goes on regardless. */
  logError?: (error: unknown) => void;
};

export type Outbox = ReturnType<typeof createOutbox>;

type Queued = { entry: OutboxEntry; stored: Promise<void>; resolve(outcomes: Outcome[]): void };

export function createOutbox({
  send,
  lane,
  persistence,
  tab,
  backoff = { minMs: 500, maxMs: 30_000 },
  onState = () => {},
  onAdopted = () => {},
  logError = (error) => console.error("The outbox couldn't use the browser's storage", error),
}: OutboxOptions) {
  const owner = tab?.id ?? crypto.randomUUID();
  const queue: Queued[] = [];
  let sending: Queued | undefined;
  let draining = false;
  let stopped = false;
  let wake: (() => void) | undefined;
  // Entries made in the same millisecond keep their order.
  let lastCreated = 0;
  /** Who waits for the entries made before a time to be answered. */
  const waiters: { time: number; resolve: () => void }[] = [];

  /** Resolves the waiters whose earlier entries are all answered. */
  function release(): void {
    const oldest = Math.min(...queue.map((queued) => queued.entry.createdAt));
    const ready = waiters.filter((waiter) => waiter.time <= oldest || stopped);
    for (const waiter of ready) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  }

  const rest = (attempt: number) =>
    new Promise<void>((resolve) => {
      const cap = Math.min(backoff.maxMs, backoff.minMs * 2 ** attempt);
      const timer = setTimeout(done, Math.random() * cap);
      wake = done;
      function done() {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      }
    });

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    let attempt = 0;
    for (;;) {
      const head = queue[0];
      if (!head || stopped) break;
      sending = head;
      // Kept before it goes out, so a reload during the send can still reconcile it.
      // oxlint-disable-next-line no-await-in-loop
      await head.stored;
      // oxlint-disable-next-line no-await-in-loop
      const sent = await send(head.entry);
      sending = undefined;
      if ("answered" in sent) {
        queue.shift();
        attempt = 0;
        persistence?.deleteEntry(head.entry.id).catch(logError);
        head.resolve(sent.answered);
        release();
        continue;
      }
      for (const { mutation } of head.entry.items) onState(mutation, "unconfirmed");
      // oxlint-disable-next-line no-await-in-loop
      await rest(attempt);
      attempt += 1;
    }
    draining = false;
  }

  /** Queues `entry`, at `index`; resolves with its outcomes, however many sends that takes. */
  function queueEntry(entry: OutboxEntry, stored: Promise<void>, index = queue.length) {
    return new Promise<Outcome[]>((resolve) => {
      queue.splice(index, 0, { entry, stored, resolve });
      void drain();
    });
  }

  return {
    /**
     * Queues one transaction's writes; resolves with each one's outcome, in order. More than a batch holds goes as
     * consecutive entries.
     */
    async enqueue(items: readonly OutboxItem[]): Promise<Outcome[]> {
      const sent: Promise<Outcome[]>[] = [];
      for (let start = 0; start < items.length; start += maxBatchItems) {
        lastCreated = Math.max(lastCreated + 0.001, Date.now());
        const entry: OutboxEntry = {
          id: uuidv7(),
          tab: owner,
          ...(lane === undefined ? {} : { lane }),
          createdAt: lastCreated,
          items: items.slice(start, start + maxBatchItems),
        };
        for (const { mutation } of entry.items) onState(mutation, "pending");
        sent.push(
          queueEntry(entry, persistence?.putEntry(entry).catch(logError) ?? Promise.resolve()),
        );
      }
      return (await Promise.all(sent)).flat();
    },

    /**
     * Takes over the entries of this account's gone tabs, oldest first, and sends them before anything not yet
     * sent. Each gone tab is adopted under its lock, so no entry is adopted twice.
     */
    async adopt(): Promise<void> {
      if (!persistence || !tab || stopped) return;
      try {
        const inLane = (entry: OutboxEntry) => entry.lane === lane;
        const gone = new Set(
          (await persistence.entries())
            .filter(inLane)
            .map((entry) => entry.tab)
            .filter((id) => id !== owner),
        );
        const adopted: OutboxEntry[] = [];
        for (const id of gone) {
          // oxlint-disable-next-line no-await-in-loop
          await tab.adopt(id, async () => {
            const theirs = (await persistence.entries()).filter(
              (entry) => entry.tab === id && inLane(entry),
            );
            for (const entry of theirs) {
              const mine = { ...entry, tab: owner };
              // oxlint-disable-next-line no-await-in-loop
              await persistence.putEntry(mine);
              adopted.push(mine);
            }
          });
        }
        // After the entry in flight, if any: it can't be called back.
        const at = sending ? 1 : 0;
        for (const [offset, entry] of adopted
          .toSorted((a, b) => a.createdAt - b.createdAt)
          .entries()) {
          for (const { mutation } of entry.items) onState(mutation, "unconfirmed");
          onAdopted(entry, queueEntry(entry, Promise.resolve(), at + offset));
        }
      } catch (error) {
        logError(error);
      }
    },

    /** Sends an unanswered entry again now, as when the stream reconnects. */
    wake(): void {
      wake?.();
    },

    /** Stops sending. Queued entries stay kept, for the next tab to adopt. */
    stop(): void {
      stopped = true;
      wake?.();
      release();
    },

    /** Resolves once every entry queued before `time` (ms since the epoch) is answered, or the outbox stops. */
    answeredBefore(time: number): Promise<void> {
      return new Promise((resolve) => {
        waiters.push({ time, resolve });
        release();
      });
    },

    /** The writes not yet answered, oldest first. */
    get queued(): readonly Mutation[] {
      return queue.flatMap(({ entry }) => entry.items.map((item) => item.mutation));
    },
  };
}
