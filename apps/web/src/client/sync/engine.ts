// The read side of the sync protocol for one signed-in client (TS-23, TS-24, TS-28): bootstrap once, then stream
// the account's changes from that `seq`, handing each one to the registered stores, and reconnect with the cursor
// whenever the stream drops. Because the stream replays from the cursor, there is nothing to buffer: the snapshot
// is current at its `seq`, and the stream continues from exactly there.
// With a tab coordinator, the account's tabs share one stream (TS-23). Every tab bootstraps itself; the leader
// streams and relays each change, its status and `reset` to the others, which apply relayed changes in `seq` order
// and bootstrap again after a gap. When the leader goes, another tab leads and streams from its own cursor.

import { bootstrapSchema, changeSchema, type Bootstrap, type Change } from "@tonaris/domain";

import { readEventStream } from "./event-stream";
import type { TabCoordinator, TabMessage } from "./tabs";

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
  /** A cursor to resume from without bootstrapping, as tests do; the web app always bootstraps. */
  cursor?: number;
  /** Reconnect delays: full jitter between 0 and an exponential cap, so a deploy's reconnects spread out. */
  backoff?: { minMs: number; maxMs: number };
  /** Reconnect when nothing, not even a keepalive, arrives for this long. The server sends one every 20 s. */
  silenceMs?: number;
  /** The account's other tabs in this browser, to share one stream with; without it, this tab streams itself. */
  tabs?: TabCoordinator;
  /** How often the leading tab repeats its status, so the others can tell it's awake (TON-137). */
  heartbeatMs?: number;
  /**
   * How long a shown tab hears nothing from the leader before it takes the lead: under the 15 s after which the
   * workspace reads as offline (`connection.ts`).
   */
  leaderSilenceMs?: number;
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
  tabs,
  heartbeatMs = 3_000,
  leaderSilenceMs = 10_000,
}: SyncEngineOptions) {
  const consumers = new Set<SyncConsumer>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const leadListeners = new Set<() => void>();
  /** Whether this tab streams for the others; always, without tabs. */
  let leading = false;
  /** While a follower bootstraps, the relayed changes that arrive meanwhile; undefined otherwise. */
  let relayed: Change[] | undefined;
  /** Wakes a waiting follower: it must bootstrap again, or it now leads. */
  let poke: (() => void) | undefined;
  /** Cuts the current backoff short, as when the browser is back online. */
  let nap: AbortController | undefined;
  /** When a follower last heard from the leader. */
  let heardAt = performance.now();
  /** A follower's look at whether its leader has gone silent, taking the lead if so; undefined while leading. */
  let checkLeader: (() => void) | undefined;

  /** Waits out a reconnect delay, unless `reconnect()` cuts it short. */
  const backOff = async (signal: AbortSignal) => {
    const cap = Math.min(backoff.maxMs, backoff.minMs * 2 ** attempt);
    attempt += 1;
    nap = new AbortController();
    await sleep(Math.random() * cap, AbortSignal.any([signal, nap.signal]));
    nap = undefined;
  };
  let waiters: { seq: number; resolve: () => void }[] = [];
  let cursor = initialCursor;
  let status: ConnectionStatus = "stopped";
  let running: AbortController | undefined;
  /** Failed connections since the last good one, for the backoff. */
  let attempt = 0;

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    if (leading) tabs?.post({ type: "status", status: next });
    for (const listener of statusListeners) listener(next);
  };

  /** Resolves the `awaitSeq` calls the cursor has reached. */
  const advance = (seq: number) => {
    cursor = seq;
    const reached = waiters.filter((waiter) => waiter.seq <= seq);
    waiters = waiters.filter((waiter) => waiter.seq > seq);
    for (const waiter of reached) waiter.resolve();
  };

  const apply = (change: Change) => {
    for (const consumer of consumers) consumer.apply(change);
    advance(change.seq);
  };

  /** A follower bootstraps again: its cursor no longer continues what the leader relays. */
  const rebootstrap = () => {
    cursor = undefined;
    poke?.();
  };

  /** A change the leader relayed, applied in `seq` order. */
  function applyRelayed(change: Change): void {
    if (cursor === undefined) {
      relayed?.push(change);
      return;
    }
    if (change.seq <= cursor) return;
    if (change.seq !== cursor + 1) rebootstrap();
    else apply(change);
  }

  function onMessage(message: TabMessage): void {
    if (leading) {
      // A tab that just opened asks for the status it missed.
      if (message.type === "hello") tabs?.post({ type: "status", status });
      return;
    }
    if (message.type !== "hello") heardAt = performance.now();
    if (message.type === "change") applyRelayed(message.change);
    else if (message.type === "reset") rebootstrap();
    // A leader that stops says so; this tab will lead next, so it keeps its own status.
    else if (message.type === "status" && message.status !== "stopped") setStatus(message.status);
  }

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
          tabs?.post({ type: "reset" });
          return;
        }
        if (event.event !== "change") continue;
        const change = changeSchema.parse(JSON.parse(event.data));
        const at = cursor ?? 0;
        if (change.seq <= at) continue;
        // The server sends the log in order; a gap means this connection can't be trusted.
        if (change.seq !== at + 1) throw new Error(`stream skipped from ${at} to ${change.seq}`);
        apply(change);
        tabs?.post({ type: "change", change });
      }
    } finally {
      clearTimeout(silence);
      signal.removeEventListener("abort", stop);
      connection.abort();
    }
  }

  /**
   * A follower: bootstraps, then applies what the leader relays, bootstrapping again whenever its cursor is lost,
   * until this tab leads. A shown tab whose leader has said nothing for `leaderSilenceMs` takes the lead from it, as
   * from a tab the phone suspended while it leads, which would otherwise hold the lock and leave this tab offline
   * (TON-137). Answers the signal that ends this tab's lead, or undefined if the session ended or the tab stopped.
   */
  async function follow(
    signal: AbortSignal,
    coordinator: TabCoordinator,
  ): Promise<AbortSignal | undefined> {
    let granted: AbortSignal | undefined;
    const take = (lead: Promise<AbortSignal>) => {
      void lead.then((lost) => {
        granted ??= lost;
        poke?.();
        return undefined;
      });
    };
    // This tab's turn in the queue, given up if it takes the lead instead.
    const turn = new AbortController();
    take(coordinator.lead(AbortSignal.any([signal, turn.signal])));
    heardAt = performance.now();
    checkLeader = () => {
      if (granted || turn.signal.aborted || signal.aborted || !coordinator.shown()) return;
      if (performance.now() - heardAt < leaderSilenceMs) return;
      turn.abort();
      take(coordinator.lead(signal, { steal: true }));
    };
    const watch = setInterval(() => checkLeader?.(), Math.min(1_000, leaderSilenceMs / 4));
    try {
      return await followUntilLeading(signal, () => granted);
    } finally {
      clearInterval(watch);
      checkLeader = undefined;
    }
  }

  /** The follower's loop: until `granted()` gives the lead, or the session ends (undefined). */
  async function followUntilLeading(
    signal: AbortSignal,
    granted: () => AbortSignal | undefined,
  ): Promise<AbortSignal | undefined> {
    while (!signal.aborted && !granted()) {
      if (cursor === undefined) {
        relayed = [];
        try {
          // oxlint-disable-next-line no-await-in-loop
          await bootstrap(signal);
          attempt = 0;
          const buffered = relayed;
          relayed = undefined;
          for (const change of buffered) applyRelayed(change);
          // The leader answers with its status; until then, its silence counts from here.
          heardAt = performance.now();
          tabs?.post({ type: "hello" });
        } catch (error) {
          relayed = undefined;
          if (signal.aborted) break;
          if (error instanceof SignedOut) {
            setStatus("signed_out");
            return undefined;
          }
          // oxlint-disable-next-line no-await-in-loop
          await backOff(signal);
          continue;
        }
      }
      if (cursor !== undefined && !granted()) {
        // oxlint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          poke = resolve;
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        poke = undefined;
      }
    }
    return signal.aborted ? undefined : granted();
  }

  /**
   * A tab of several: follows until it leads, then streams for the others, repeating its status so they can tell it's
   * awake. If another tab takes the lead from it, as when this tab seemed asleep, it follows again (TON-137).
   */
  async function runTab(coordinator: TabCoordinator, signal: AbortSignal): Promise<void> {
    const unsubscribe = coordinator.subscribe(onMessage);
    try {
      while (!signal.aborted) {
        // oxlint-disable-next-line no-await-in-loop
        const lost = await follow(signal, coordinator);
        if (!lost || signal.aborted) return;
        leading = true;
        coordinator.post({ type: "status", status });
        for (const listener of leadListeners) listener();
        const beat = setInterval(() => coordinator.post({ type: "status", status }), heartbeatMs);
        try {
          // oxlint-disable-next-line no-await-in-loop
          await run(AbortSignal.any([signal, lost]));
        } finally {
          clearInterval(beat);
        }
        leading = false;
      }
    } finally {
      unsubscribe();
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
      // oxlint-disable-next-line no-await-in-loop
      await backOff(signal);
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
      if (tabs) void runTab(tabs, running.signal);
      else {
        leading = true;
        void run(running.signal);
      }
    },

    stop(): void {
      running?.abort();
      running = undefined;
      setStatus("stopped");
      leading = false;
    },

    /**
     * Tries again now rather than after the current delay, as when the browser is back online or the page is shown
     * again; a follower looks at once whether its leader has gone silent (TON-137).
     */
    reconnect(): void {
      nap?.abort();
      checkLeader?.();
    },

    /** Calls `listener` when this tab starts streaming for the others (TS-23). */
    onLead(listener: () => void): () => void {
      leadListeners.add(listener);
      return () => leadListeners.delete(listener);
    },

    /** Whether this tab holds the stream. */
    get leading(): boolean {
      return leading;
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
