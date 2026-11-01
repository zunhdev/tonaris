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
export const queuedStates = ["pending", "unconfirmed"] as const;
export type QueuedState = (typeof queuedStates)[number];

export type OutboxOptions = {
  send: (entry: OutboxEntry) => Promise<Sent>;
  /** The lane its entries are kept under, such as `capture`; none for the main lane. */
  lane?: string;
  /** Where entries are kept until answered; without it, a reload loses them. */
  persistence?: SyncPersistence;
  /** This tab, which owns new entries and adopts gone tabs' (TS-23). */
  tab?: Pick<TabCoordinator, "id" | "adopt" | "adoptWhenGone">;
  /** Delays between sends of an unanswered entry: full jitter up to an exponential cap. */
  backoff?: { minMs: number; maxMs: number };
  /**
   * When to look again for tabs whose locks were still held. A reloaded tab's lock goes a moment after the page does,
   * which a busy browser can make later than the new page's first look; without these, its writes would wait for the
   * leader's next look, up to 10 s later (`adoptEveryMs`, TON-102).
   */
  adoptRetriesMs?: readonly number[];
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
  adoptRetriesMs = [250, 1_000, 4_000],
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

  const inLane = (entry: OutboxEntry) => entry.lane === lane;

  /** Under `id`'s lock, makes that gone tab's entries this tab's, adding them to `adopted`. */
  async function takeOver(id: string, adopted: OutboxEntry[]): Promise<void> {
    if (!persistence) return;
    const theirs = (await persistence.entries()).filter(
      (entry) => entry.tab === id && inLane(entry),
    );
    for (const entry of theirs) {
      const mine = { ...entry, tab: owner };
      // oxlint-disable-next-line no-await-in-loop
      await persistence.putEntry(mine);
      adopted.push(mine);
    }
  }

  /** Sends adopted entries, oldest first, after the entry in flight, if any: it can't be called back. */
  function sendAdopted(adopted: readonly OutboxEntry[]): void {
    const at = sending ? 1 : 0;
    for (const [offset, entry] of adopted.toSorted((a, b) => a.createdAt - b.createdAt).entries()) {
      for (const { mutation } of entry.items) onState(mutation, "unconfirmed");
      onAdopted(entry, queueEntry(entry, Promise.resolve(), at + offset));
    }
  }

  /** The tabs whose lock this tab waits on, to adopt their entries the moment they go. */
  const awaited = new Set<string>();

  /**
   * Waits on a tab that hasn't let go yet, such as a reload's old page, and adopts its entries the moment it does,
   * rather than at the next look (TON-137).
   */
  function adoptWhenGone(id: string): void {
    if (!tab || awaited.has(id)) return;
    awaited.add(id);
    const adopted: OutboxEntry[] = [];
    tab
      .adoptWhenGone(id, () => takeOver(id, adopted))
      .then(() => {
        if (!stopped) sendAdopted(adopted);
        return undefined;
      })
      .catch(logError)
      .finally(() => awaited.delete(id));
  }

  /** Adopts the gone tabs' entries; `retry` counts the looks again so far. */
  async function adopt(retry: number): Promise<void> {
    if (!persistence || !tab || stopped) return;
    try {
      const gone = new Set(
        (await persistence.entries())
          .filter(inLane)
          .map((entry) => entry.tab)
          .filter((id) => id !== owner),
      );
      const adopted: OutboxEntry[] = [];
      let held = false;
      for (const id of gone) {
        // oxlint-disable-next-line no-await-in-loop
        const ran = await tab.adopt(id, () => takeOver(id, adopted));
        if (!ran) {
          held = true;
          adoptWhenGone(id);
        }
      }
      sendAdopted(adopted);
      const delay = adoptRetriesMs[retry];
      if (held && delay !== undefined) setTimeout(() => void adopt(retry + 1), delay);
    } catch (error) {
      logError(error);
    }
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
     * sent. Each gone tab is adopted under its lock, so no entry is adopted twice. A tab whose lock is still held, such
     * as a reload's old page not yet let go, is waited on and adopted the moment it goes, and looked at again after
     * `adoptRetriesMs`.
     */
    adopt: () => adopt(0),

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
