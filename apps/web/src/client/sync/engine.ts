// The read side of the sync protocol for one signed-in client (TS-23, TS-24, TS-28): bootstrap once, then stream
// the account's changes from that `seq`, handing each one to the registered stores, and reconnect with the cursor
// whenever the stream drops. Because the stream replays from the cursor, there is nothing to buffer: the snapshot
// is current at its `seq`, and the stream continues from exactly there.

import { bootstrapSchema, changeSchema, type Bootstrap, type Change } from "@tonaris/domain";

import { readEventStream } from "./event-stream";

/** A store fed by the engine: TanStack DB collections (albums.ts). */
export type SyncConsumer = {
  /** Replaces everything with a snapshot: on the first bootstrap, and after a `reset`. */
  reset(snapshot: Bootstrap): void;
  /** Applies one committed change, in `seq` order. */
  apply(change: Change): void;
};

/** How the client reaches the API: the browser's fetch with credentials, or a test's. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type ConnectionStatus = "stopped" | "connecting" | "live" | "reconnecting" | "signed_out";

export type SyncEngineOptions = {
  apiUrl: string;
  /** The browser's fetch with credentials; tests pass one that adds a session and injects faults. */
  fetch: Fetch;
  /** A cursor kept from an earlier session (TON-30 persists it); without one, the engine bootstraps first. */
  cursor?: number;
  /** Reconnect delays: full jitter between 0 and an exponential cap, so a deploy's reconnects spread out. */
  backoff?: { minMs: number; maxMs: number };
  /** Reconnect when nothing, not even a keepalive, arrives for this long. The server sends one every 20 s. */
  silenceMs?: number;
};

export type SyncEngine = ReturnType<typeof createSyncEngine>;

class StreamClosed extends Error {}
class SignedOut extends Error {}

export function createSyncEngine({
  apiUrl,
  fetch,
  cursor: initialCursor,
  backoff = { minMs: 500, maxMs: 30_000 },
  silenceMs = 45_000,
}: SyncEngineOptions) {
  const consumers = new Set<SyncConsumer>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let waiters: { seq: number; resolve: () => void }[] = [];
  let cursor = initialCursor;
  let status: ConnectionStatus = "stopped";
  let running: AbortController | undefined;
  /** Failed connections since the last good one, for the backoff. */
  let attempt = 0;

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  /** Resolves the `awaitSeq` calls the cursor has reached. */
  const advance = (seq: number) => {
    cursor = seq;
    const reached = waiters.filter((waiter) => waiter.seq <= seq);
    waiters = waiters.filter((waiter) => waiter.seq > seq);
    for (const waiter of reached) waiter.resolve();
  };

  async function bootstrap(signal: AbortSignal): Promise<void> {
    const response = await fetch(`${apiUrl}/v1/sync/bootstrap`, { signal });
    if (response.status === 401) throw new SignedOut();
    if (!response.ok) throw new Error(`bootstrap answered ${response.status}`);
    const snapshot = bootstrapSchema.parse(await response.json());
    for (const consumer of consumers) consumer.reset(snapshot);
    advance(snapshot.seq);
  }

  /** Streams from the cursor until the connection ends; `reset` clears the cursor so the loop bootstraps. */
  async function stream(signal: AbortSignal): Promise<void> {
    const connection = new AbortController();
    const stop = () => connection.abort();
    signal.addEventListener("abort", stop, { once: true });
    let silence: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      clearTimeout(silence);
      silence = setTimeout(() => connection.abort(new StreamClosed("silent")), silenceMs);
    };
    try {
      heard();
      // The cursor goes in the query, not in Last-Event-ID: a custom header would make every cross-origin
      // connection wait for a CORS preflight, and the API's CORS rules allow only content-type (TS-102).
      const response = await fetch(`${apiUrl}/v1/sync/stream?after=${cursor ?? 0}`, {
        signal: connection.signal,
      });
      if (response.status === 401) throw new SignedOut();
      if (!response.ok || !response.body) throw new Error(`stream answered ${response.status}`);
      setStatus("live");
      attempt = 0;
      for await (const event of readEventStream(response.body, heard)) {
        if (event.event === "reset") {
          cursor = undefined;
          return;
        }
        if (event.event !== "change") continue;
        const change = changeSchema.parse(JSON.parse(event.data));
        const at = cursor ?? 0;
        if (change.seq <= at) continue;
        // The server sends the log in order; a gap means this connection can't be trusted.
        if (change.seq !== at + 1) throw new Error(`stream skipped from ${at} to ${change.seq}`);
        for (const consumer of consumers) consumer.apply(change);
        advance(change.seq);
      }
    } finally {
      clearTimeout(silence);
      signal.removeEventListener("abort", stop);
      connection.abort();
    }
  }

  async function run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        if (cursor === undefined) await bootstrap(signal);
        // oxlint-disable-next-line no-await-in-loop
        await stream(signal);
        // An ended stream (a deploy, a reset) is reconnected at once; a failing one backs off below.
        if (cursor === undefined) continue;
      } catch (error) {
        if (signal.aborted) break;
        if (error instanceof SignedOut) {
          setStatus("signed_out");
          return;
        }
      }
      if (signal.aborted) break;
      setStatus("reconnecting");
      const cap = Math.min(backoff.maxMs, backoff.minMs * 2 ** attempt);
      attempt += 1;
      // oxlint-disable-next-line no-await-in-loop
      await sleep(Math.random() * cap, signal);
    }
  }

  return {
    /** Registers a store; register every store before `start()`. Returns the unregister function. */
    register(consumer: SyncConsumer): () => void {
      consumers.add(consumer);
      return () => consumers.delete(consumer);
    },

    start(): void {
      if (running) return;
      running = new AbortController();
      setStatus("connecting");
      void run(running.signal);
    },

    stop(): void {
      running?.abort();
      running = undefined;
      setStatus("stopped");
    },

    /** Resolves once the stream has delivered `seq` (TS-24): the change is then in every store. */
    awaitSeq(seq: number): Promise<void> {
      if (cursor !== undefined && cursor >= seq) return Promise.resolve();
      return new Promise((resolve) => waiters.push({ seq, resolve }));
    },

    /** Calls `listener` with every status change; returns the unsubscribe function. */
    onStatus(listener: (status: ConnectionStatus) => void): () => void {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },

    get status(): ConnectionStatus {
      return status;
    },

    /** The last `seq` received, or undefined before the first bootstrap. */
    get seq(): number | undefined {
      return cursor;
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
