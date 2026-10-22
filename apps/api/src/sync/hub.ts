// The in-process change bus and the owner streams it feeds (TS-23). After a mutation commits, its changes are
// published to every open stream of the account. A stream hands them out in `seq` order, and reads the change
// log itself whenever what it was handed doesn't continue its cursor:
// - on connect, to replay everything after the client's cursor (`Last-Event-ID`);
// - after a gap, as when two commits publish out of order;
// - after falling behind: a client that stops reading never holds more than `bufferLimit` changes in memory.
// So delivery is correct even when a publish is lost, which is what lets a second instance swap the bus for
// Postgres LISTEN/NOTIFY later. A cursor the log no longer reaches, or one it never had, ends with `reset`.
// A stream also ends once the session that opened it is signed out, revoked or expired: while streams are open,
// the hub checks their sessions every 30 s.

import type { SSEPayload } from "elysia";

import { activeSessionIds, headSeq, readChanges, type Database } from "@tonaris/db";
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
function databaseLog(db: Database): ChangeLog {
  return {
    read: (accountId, after, limit) => readChanges(db, accountId, after, limit),
    head: (accountId) => headSeq(db, accountId),
  };
}

/** Which of the streams' sessions are still live (packages/db). */
export type SessionCheck = { active(ids: readonly string[]): Promise<Set<string>> };

/** The sessions in the database. */
function databaseSessions(db: Database): SessionCheck {
  return { active: (ids) => activeSessionIds(db, ids) };
}

export type SyncHubOptions = {
  log: ChangeLog;
  /** Checks streams' sessions; without it, a stream lasts as long as its connection. */
  sessions?: SessionCheck;
  /** How often open streams' sessions are checked (TS-23). */
  sessionCheckMs?: number;
  /** Gets a failed session check; the streams stay open until the next one. */
  logError?: (error: unknown) => void;
  /** Changes read from the log at a time. */
  pageSize?: number;
  /** Changes a stream holds for a slow client before it drops them and reads the log instead. */
  bufferLimit?: number;
};

type StreamSettings = Required<Pick<SyncHubOptions, "log" | "pageSize" | "bufferLimit">>;

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
    /** The session that opened the stream, if it has one to check. */
    readonly sessionId: string | undefined,
    cursor: number,
    private readonly options: StreamSettings,
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

/** A hub on the database's change log and sessions. Close it on shutdown. */
export function databaseHub(
  db: Database,
  options: Omit<SyncHubOptions, "log" | "sessions"> = {},
): SyncHub {
  return createSyncHub({ log: databaseLog(db), sessions: databaseSessions(db), ...options });
}

export function createSyncHub(options: SyncHubOptions) {
  const {
    sessions,
    sessionCheckMs = 30_000,
    logError = (error: unknown) => console.error("Checking stream sessions failed", error),
    ...rest
  } = options;
  const settings: StreamSettings = { pageSize: 500, bufferLimit: 1_000, ...rest };
  const streams = new Map<string, Set<Subscription>>();
  const shutdown = new AbortController();
  let checks: ReturnType<typeof setInterval> | undefined;

  const openStreams = () =>
    [...streams.values()].flatMap((subscriptions) => Array.from(subscriptions));
  const endWhere = (ends: (subscription: Subscription) => boolean) => {
    for (const subscription of openStreams().filter(ends)) subscription.end();
  };

  /** Ends the streams whose sessions are no longer live. */
  async function checkSessions(): Promise<void> {
    const ids = [
      ...new Set(openStreams().flatMap(({ sessionId }) => (sessionId ? [sessionId] : []))),
    ];
    if (!sessions || ids.length === 0) return;
    let active: Set<string>;
    try {
      active = await sessions.active(ids);
    } catch (error) {
      logError(error);
      return;
    }
    endWhere(({ sessionId }) => sessionId !== undefined && !active.has(sessionId));
  }

  /** Checks sessions only while streams are open. */
  function scheduleChecks(): void {
    const any = streams.size > 0;
    if (sessions && any && !checks) {
      checks = setInterval(() => void checkSessions(), sessionCheckMs);
    } else if (!any && checks) {
      clearInterval(checks);
      checks = undefined;
    }
  }

  return {
    /** Hands committed changes to the account's open streams (TS-20 step 6). */
    publish(accountId: string, changes: readonly Change[]): void {
      if (changes.length === 0) return;
      for (const stream of streams.get(accountId) ?? []) stream.offer(changes);
    },

    /**
     * A stream of the account's changes after `cursor`, opened by `sessionId`. It leaves the hub when it ends, and
     * ends once that session is no longer live.
     */
    subscribe(accountId: string, cursor: number, sessionId?: string): StreamSource<SyncEvent> {
      const subscription: Subscription = new Subscription(
        accountId,
        sessionId,
        cursor,
        settings,
        () => {
          const account = streams.get(accountId);
          account?.delete(subscription);
          if (account?.size === 0) streams.delete(accountId);
          scheduleChecks();
        },
      );
      const account = streams.get(accountId) ?? new Set();
      streams.set(accountId, account.add(subscription));
      scheduleChecks();
      return subscription;
    },

    /** Ends the streams of these sessions at once, as a revocation that can't wait for the next check does. */
    endSessions(sessionIds: Iterable<string>): void {
      const ending = new Set(sessionIds);
      endWhere(({ sessionId }) => sessionId !== undefined && ending.has(sessionId));
    },

    /** Aborts on `close()`: every stream ends, so a graceful stop can complete (TS-23). */
    signal: shutdown.signal,

    close(): void {
      shutdown.abort();
      clearInterval(checks);
      checks = undefined;
    },

    /** Open streams, for tests and diagnostics. */
    get size(): number {
      let size = 0;
      for (const open of streams.values()) size += open.size;
      return size;
    },
  };
}
