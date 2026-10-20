// The in-process change bus and the owner streams it feeds (TS-23). After a mutation commits, its changes are
// published to every open stream of the account. A stream hands them out in `seq` order, and reads the change
// log itself whenever what it was handed doesn't continue its cursor:
// - on connect, to replay everything after the client's cursor (`Last-Event-ID`);
// - after a gap, as when two commits publish out of order;
// - after falling behind: a client that stops reading never holds more than `bufferLimit` changes in memory.
// So delivery is correct even when a publish is lost, which is what lets a second instance swap the bus for
// Postgres LISTEN/NOTIFY later. A cursor the log no longer reaches, or one it never had, ends with `reset`.

import type { SSEPayload } from "elysia";

import { headSeq, readChanges, type Database } from "@tonaris/db";
import type { Change, StreamReset } from "@tonaris/domain";

import type { StreamSource } from "../sse";

export type ChangeEvent = SSEPayload<Change, "change"> & { id: string; data: Change };
export type ResetEvent = SSEPayload<StreamReset, "reset"> & { data: StreamReset };
export type SyncEvent = ChangeEvent | ResetEvent;

/** Where streams read what they weren't handed: the change log (packages/db). */
export type ChangeLog = {
  read(accountId: string, after: number, limit: number): Promise<Change[]>;
  head(accountId: string): Promise<number>;
};

/** The change log in the database. */
export function databaseLog(db: Database): ChangeLog {
  return {
    read: (accountId, after, limit) => readChanges(db, accountId, after, limit),
    head: (accountId) => headSeq(db, accountId),
  };
}

export type SyncHubOptions = {
  log: ChangeLog;
  /** Changes read from the log at a time. */
  pageSize?: number;
  /** Changes a stream holds for a slow client before it drops them and reads the log instead. */
  bufferLimit?: number;
};

type Result = IteratorResult<SyncEvent, undefined>;
const done: Result = { done: true, value: undefined };

const changeEvent = (change: Change): ChangeEvent => ({
  id: String(change.seq),
  event: "change",
  data: change,
});

/** One owner stream: a pull source for `eventStream`. */
class Subscription implements StreamSource<SyncEvent> {
  /** The last `seq` handed to the stream. */
  #cursor: number;
  /** Published changes that continue the cursor, in order. */
  #buffer: Change[] = [];
  /** Whether the buffer may be missing changes, so the log must be read once it is drained. */
  #stale = true;
  #reading = false;
  /** Whether something was published during a read, which the read may not have seen. */
  #publishedDuringRead = false;
  #ended = false;
  #wake: (() => void) | undefined;

  constructor(
    readonly accountId: string,
    cursor: number,
    private readonly options: Required<SyncHubOptions>,
    private readonly onEnd: () => void,
  ) {
    this.#cursor = cursor;
  }

  /** Takes published changes, if they continue what the stream has; otherwise marks it stale. */
  offer(changes: readonly Change[]): void {
    if (this.#ended) return;
    if (this.#reading) this.#publishedDuringRead = true;
    else if (!this.#stale) {
      for (const change of changes) {
        const last = this.#buffer.at(-1)?.seq ?? this.#cursor;
        if (change.seq <= last) continue;
        if (change.seq !== last + 1 || this.#buffer.length >= this.options.bufferLimit) {
          this.#buffer = [];
          this.#stale = true;
          break;
        }
        this.#buffer.push(change);
      }
    }
    this.#wake?.();
  }

  async next(): Promise<Result> {
    for (;;) {
      if (this.#ended) return done;
      const change = this.#buffer.shift();
      if (change) {
        this.#cursor = change.seq;
        return { done: false, value: changeEvent(change) };
      }
      if (this.#stale) {
        // oxlint-disable-next-line no-await-in-loop
        const reset = await this.#readLog();
        if (reset) {
          this.end();
          return { done: false, value: { event: "reset", data: reset } };
        }
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
      this.#wake = undefined;
    }
  }

  /** Refills the buffer from the log; a reset if the log can't continue the cursor. */
  async #readLog(): Promise<StreamReset | undefined> {
    this.#reading = true;
    this.#publishedDuringRead = false;
    try {
      // The head first: every change up to it is committed, so the read below sees all of them.
      const head = await this.options.log.head(this.accountId);
      if (this.#cursor > head) return { reason: "cursor_unknown" };
      const changes = await this.options.log.read(
        this.accountId,
        this.#cursor,
        this.options.pageSize,
      );
      const first = changes[0]?.seq;
      if (this.#cursor < head && first !== this.#cursor + 1) return { reason: "cursor_expired" };
      this.#buffer = changes;
      this.#stale = this.#publishedDuringRead || changes.length === this.options.pageSize;
      return undefined;
    } finally {
      this.#reading = false;
    }
  }

  end(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#buffer = [];
    this.#wake?.();
    this.onEnd();
  }
}

export type SyncHub = ReturnType<typeof createSyncHub>;

export function createSyncHub(options: SyncHubOptions) {
  const settings = { pageSize: 500, bufferLimit: 1_000, ...options };
  const streams = new Map<string, Set<Subscription>>();
  const shutdown = new AbortController();

  return {
    /** Hands committed changes to the account's open streams (TS-20 step 6). */
    publish(accountId: string, changes: readonly Change[]): void {
      if (changes.length === 0) return;
      for (const stream of streams.get(accountId) ?? []) stream.offer(changes);
    },

    /** A stream of the account's changes after `cursor`. It leaves the hub when it ends. */
    subscribe(accountId: string, cursor: number): StreamSource<SyncEvent> {
      const subscription: Subscription = new Subscription(accountId, cursor, settings, () => {
        const open = streams.get(accountId);
        open?.delete(subscription);
        if (open?.size === 0) streams.delete(accountId);
      });
      const open = streams.get(accountId) ?? new Set();
      streams.set(accountId, open.add(subscription));
      return subscription;
    },

    /** Aborts on `close()`: every stream ends, so a graceful stop can complete (TS-23). */
    signal: shutdown.signal,

    close(): void {
      shutdown.abort();
    },

    /** Open streams, for tests and diagnostics. */
    get size(): number {
      let size = 0;
      for (const open of streams.values()) size += open.size;
      return size;
    },
  };
}
