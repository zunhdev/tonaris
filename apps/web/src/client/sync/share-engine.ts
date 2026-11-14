// A share the person edits, held like their own collection (TS-24, TON-191): an engine with the sync engine's
// interface over the share's own endpoints. It reads `GET /v1/shared/{id}` when it starts and after each reconnect,
// again after each `shared-invalidate` its stream sends, and whenever a write waits on a newer `seq`, and hands the
// collections a `reset` each time: a share is small, and a read also covers content moving into or out of it. Its
// `seq` is the owner's, which the read carries, so the writer confirms an editor's writes as it confirms the owner's
// (TS-20). A read answered 404 means access ended: it stops, and says so. One tab reads its share itself, as a
// viewer's page does: there's no tab coordination. Its stream is the tab's one stream of that share, shared with the
// sidebar's tree (follow-stream.ts), which also brings it back after a phone sleeps.

import {
  appAccountDefaults,
  sharedSnapshotSchema,
  type Bootstrap,
  type SharedSnapshot,
  type ShareRole,
} from "@tonaris/domain";

import type { ConnectionStatus, Fetch, SyncConsumer, SyncEngine } from "./engine";
import { followStream, resumeStreams } from "./follow-stream";

/** What each read says of the share besides its content: the person's role on it, and its owner's name. */
export type ShareRead = { role: ShareRole; ownerName: string | null };

export type ShareEngine = SyncEngine & {
  /** Calls `listener` after each read; returns the unsubscribe function. */
  onRead(listener: (read: ShareRead) => void): () => void;
  /** Calls `listener` once access ends; returns the unsubscribe function. */
  onUnavailable(listener: () => void): () => void;
};

/** The share as the collections take a bootstrap. The person's own records come from their own client. */
export function bootstrapOf(snapshot: SharedSnapshot): Bootstrap {
  const { seq, containers, albums, memberships, links, fields, fieldValues } = snapshot;
  return {
    seq,
    containers,
    albums,
    memberships,
    links,
    fields,
    fieldValues,
    views: [],
    positions: [],
    defaults: appAccountDefaults,
    trashUnits: [],
    references: [],
  };
}

class SignedOut extends Error {}
class Unavailable extends Error {}

export function createShareEngine({
  apiUrl,
  fetch,
  rootId,
  debounceMs = 250,
  backoff = { minMs: 500, maxMs: 30_000 },
  silenceMs = 45_000,
}: {
  apiUrl: string;
  fetch: Fetch;
  /** The shared folder or list. */
  rootId: string;
  /** How long a read waits after a notice, so a burst of saves reads once (TS-23). */
  debounceMs?: number;
  backoff?: { minMs: number; maxMs: number };
  /** Reconnect when nothing, not even a keepalive, arrives for this long. The server sends one every 20 s. */
  silenceMs?: number;
}): ShareEngine {
  const consumers = new Set<SyncConsumer>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  const leadListeners = new Set<() => void>();
  const readListeners = new Set<(read: ShareRead) => void>();
  const unavailableListeners = new Set<() => void>();
  let waiters: { seq: number; resolve: () => void }[] = [];
  let cursor: number | undefined;
  let status: ConnectionStatus = "stopped";
  let running: AbortController | undefined;
  let attempt = 0;
  let nap: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The read going on, if any; `again` asks for one more after it, as a notice that came meanwhile does. */
  let reading: Promise<void> | undefined;
  let again = false;
  let gone = false;
  /** Stops following the share's stream. */
  let unfollow: (() => void) | undefined;
  /** Whether a read has succeeded since the start: until then, the share isn't live. */
  let firstRead = false;

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    for (const listener of statusListeners) listener(next);
  };

  /** Resolves the `awaitSeq` calls the reads have reached. */
  const advance = (seq: number) => {
    cursor = seq;
    const reached = waiters.filter((waiter) => waiter.seq <= seq);
    waiters = waiters.filter((waiter) => waiter.seq > seq);
    for (const waiter of reached) waiter.resolve();
  };

  /** Access ended: stop, and tell whoever shows the share. */
  const endAccess = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    unfollow?.();
    running?.abort();
    running = undefined;
    setStatus("stopped");
    for (const listener of unavailableListeners) listener();
  };

  async function readOnce(signal: AbortSignal): Promise<void> {
    const response = await fetch(`${apiUrl}/v1/shared/${rootId}`, { signal });
    if (response.status === 401) throw new SignedOut();
    if (response.status === 404) throw new Unavailable();
    if (!response.ok) throw new Error(`the share answered ${response.status}`);
    const snapshot = sharedSnapshotSchema.parse(await response.json());
    const bootstrap = bootstrapOf(snapshot);
    for (const consumer of consumers) consumer.reset(bootstrap);
    advance(snapshot.seq);
    const said = { role: snapshot.role, ownerName: snapshot.owner.displayName };
    for (const listener of readListeners) listener(said);
  }

  /** Reads the share, or, while a read goes on, asks for one more after it. */
  function read(signal: AbortSignal): Promise<void> {
    if (reading) {
      again = true;
      return reading;
    }
    reading = (async () => {
      do {
        again = false;
        // oxlint-disable-next-line no-await-in-loop
        await readOnce(signal);
      } while (again && !signal.aborted);
    })().finally(() => {
      reading = undefined;
    });
    return reading;
  }

  /** Reads soon, once a burst of notices settles; only an ended access stops it, the stream retries the rest. */
  function readSoon(): void {
    const signal = running?.signal;
    if (!signal) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      read(signal).catch((error: unknown) => {
        if (error instanceof Unavailable) endAccess();
      });
    }, debounceMs);
  }

  async function backOff(signal: AbortSignal): Promise<void> {
    const cap = Math.min(backoff.maxMs, backoff.minMs * 2 ** attempt);
    attempt += 1;
    nap = new AbortController();
    const done = AbortSignal.any([signal, nap.signal]);
    await new Promise<void>((resolve) => {
      const wait = setTimeout(resolve, Math.random() * cap);
      done.addEventListener(
        "abort",
        () => {
          clearTimeout(wait);
          resolve();
        },
        { once: true },
      );
    });
    nap = undefined;
  }

  /** The person signed out: stop, and say so. */
  const signedOut = () => {
    clearTimeout(timer);
    unfollow?.();
    running?.abort();
    running = undefined;
    setStatus("signed_out");
  };

  /** The first read, retried with growing pauses until it lands, the session ends or access does. */
  async function readFirst(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        await read(signal);
        attempt = 0;
        firstRead = true;
        return;
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof SignedOut) return signedOut();
        if (error instanceof Unavailable) return endAccess();
      }
      // oxlint-disable-next-line no-await-in-loop
      await backOff(signal);
    }
  }

  return {
    register(consumer: SyncConsumer): () => void {
      consumers.add(consumer);
      return () => consumers.delete(consumer);
    },

    start(): void {
      if (running || gone) return;
      running = new AbortController();
      const { signal } = running;
      setStatus("connecting");
      // It holds its stream itself, as a tab that leads does.
      for (const listener of leadListeners) listener();
      let open = false;
      const live = () => {
        if (open && firstRead && !signal.aborted) setStatus("live");
      };
      void readFirst(signal).then(live);
      unfollow = followStream(
        `${apiUrl}/v1/shared/${rootId}/stream`,
        {
          onEvent: (event) => {
            if (event.event === "shared-invalidate") readSoon();
          },
          onState: (state, missed) => {
            open = state === "open";
            if (state === "retrying") setStatus("reconnecting");
            // What changed while it was away is in a read.
            if (missed) readSoon();
            live();
          },
          onEnd: (refused) => (refused === 401 ? signedOut() : endAccess()),
        },
        { fetch, backoff, silenceMs },
      );
    },

    stop(): void {
      clearTimeout(timer);
      unfollow?.();
      unfollow = undefined;
      running?.abort();
      running = undefined;
      firstRead = false;
      setStatus("stopped");
    },

    reconnect(): void {
      nap?.abort();
      resumeStreams();
    },

    onLead(listener: () => void): () => void {
      leadListeners.add(listener);
      return () => leadListeners.delete(listener);
    },

    get leading(): boolean {
      return running !== undefined;
    },

    /** Resolves once a read has reached `seq`; asks for one, rather than waiting on the stream's notice. */
    awaitSeq(seq: number): Promise<void> {
      if (cursor !== undefined && cursor >= seq) return Promise.resolve();
      const reached = new Promise<void>((resolve) => waiters.push({ seq, resolve }));
      readSoon();
      return reached;
    },

    onStatus(listener: (status: ConnectionStatus) => void): () => void {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },

    get status(): ConnectionStatus {
      return status;
    },

    get seq(): number | undefined {
      return cursor;
    },

    onRead(listener: (read: ShareRead) => void): () => void {
      readListeners.add(listener);
      return () => readListeners.delete(listener);
    },

    onUnavailable(listener: () => void): () => void {
      unavailableListeners.add(listener);
      return () => unavailableListeners.delete(listener);
    },
  };
}
