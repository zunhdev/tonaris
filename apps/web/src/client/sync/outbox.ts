// The client's outbox (TS-22): mutations go to the server one at a time, in the order they were made, so a later
// change never overtakes the one it depends on (create a list, then add to it). A mutation sent without an
// answer is unconfirmed: the outbox keeps it at the head and sends the same envelope again, after a backoff or as
// soon as the connection is back. The server applies it once or returns the stored outcome, so the retry is how
// an unconfirmed outcome is reconciled (FR-13.5). Persisting the queue to IndexedDB is TON-30's.

import type { Mutation, Outcome } from "@tonaris/domain";

/** What sending gave: the server's outcome, or no answer (a network error, a timeout, a 5xx). */
export type Sent = { answered: Outcome } | { unanswered: unknown };

/** `pending` while queued or in flight; `unconfirmed` once a send went unanswered. */
export type QueuedState = "pending" | "unconfirmed";

export type OutboxOptions = {
  send: (mutation: Mutation) => Promise<Sent>;
  /** Delays between sends of an unanswered mutation: full jitter up to an exponential cap. */
  backoff?: { minMs: number; maxMs: number };
  onState?: (mutation: Mutation, state: QueuedState) => void;
};

export type Outbox = ReturnType<typeof createOutbox>;

type Entry = { mutation: Mutation; resolve(outcome: Outcome): void };

export function createOutbox({
  send,
  backoff = { minMs: 500, maxMs: 30_000 },
  onState = () => {},
}: OutboxOptions) {
  const queue: Entry[] = [];
  let draining = false;
  let stopped = false;
  let wake: (() => void) | undefined;

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
      // oxlint-disable-next-line no-await-in-loop
      const sent = await send(head.mutation);
      if ("answered" in sent) {
        queue.shift();
        attempt = 0;
        head.resolve(sent.answered);
        continue;
      }
      onState(head.mutation, "unconfirmed");
      // oxlint-disable-next-line no-await-in-loop
      await rest(attempt);
      attempt += 1;
    }
    draining = false;
  }

  return {
    /** Queues `mutation`; resolves with the server's outcome, however many sends that takes. */
    enqueue(mutation: Mutation): Promise<Outcome> {
      return new Promise((resolve) => {
        queue.push({ mutation, resolve });
        onState(mutation, "pending");
        void drain();
      });
    },

    /** Sends an unanswered mutation again now, as when the stream reconnects. */
    wake(): void {
      wake?.();
    },

    /** Stops sending. Queued mutations stay unsettled (a reload restores them, TON-30). */
    stop(): void {
      stopped = true;
      wake?.();
    },

    /** The mutations not yet answered, oldest first. */
    get queued(): readonly Mutation[] {
      return queue.map((entry) => entry.mutation);
    },
  };
}
