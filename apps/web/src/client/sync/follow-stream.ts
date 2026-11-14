// Following a share's notices (TS-23, TS-24). A guest's page, a viewer's page, the sidebar's open shared folders and
// the client of a share the person edits all follow a share's stream through here, so a tab opens one connection per
// stream however many follow it (TON-130). Like the account's own stream (engine.ts), a stream here:
// - reconnects after a drop with growing, jittered pauses;
// - notices a connection gone silent, as after a phone slept: the server sends a keepalive every 20 s;
// - comes back at once when the page is shown again or the network returns (`resumeStreams`, TON-137);
// - ends for everyone on a 401 or a 404, which retrying can't mend.
// A follower hears when the stream opens again after a drop, since notices sent meanwhile were missed.

import type { Fetch } from "./engine";
import { readEventStream, type ServerSentEvent } from "./event-stream";

export type StreamState = "connecting" | "open" | "retrying";

export type StreamFollower = {
  /** Each event the stream sends. */
  onEvent?(event: ServerSentEvent): void;
  /** The stream's state now, then at each change. `missed` when it opens again after a drop. */
  onState?(state: StreamState, missed: boolean): void;
  /** The stream refused for good: 401, signed out, or 404, no longer available. It has stopped. */
  onEnd?(status: 401 | 404): void;
};

export type StreamOptions = {
  /** The browser's, with its cookies, by default. */
  fetch?: Fetch;
  backoff?: { minMs: number; maxMs: number };
  /** Reconnect when nothing, not even a keepalive, arrives for this long. */
  silenceMs?: number;
};

type Stream = {
  followers: Set<StreamFollower>;
  state: StreamState;
  stop(): void;
  resume(): void;
};

/** This tab's streams, by URL. */
const streams = new Map<string, Stream>();

/**
 * Follows the stream at `url`, opening it unless this tab already does; answers how to stop following. The stream
 * closes once nobody follows it.
 */
export function followStream(
  url: string,
  follower: StreamFollower,
  options: StreamOptions = {},
): () => void {
  let stream = streams.get(url);
  if (!stream) {
    stream = open(url, options);
    streams.set(url, stream);
    watchLifecycle();
  }
  const { followers } = stream;
  followers.add(follower);
  follower.onState?.(stream.state, false);
  let following = true;
  return () => {
    if (!following) return;
    following = false;
    followers.delete(follower);
    if (followers.size === 0) stream.stop();
  };
}

/**
 * Tries every stream again now rather than after its pause, and drops a connection that has gone quiet: for when the
 * page is shown again or the network is back (TON-137).
 */
export function resumeStreams(): void {
  for (const stream of streams.values()) stream.resume();
}

function open(
  url: string,
  {
    fetch = (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
    backoff = { minMs: 1_000, maxMs: 30_000 },
    silenceMs = 45_000,
  }: StreamOptions,
): Stream {
  const followers = new Set<StreamFollower>();
  const life = new AbortController();
  let attempt = 0;
  let dropped = false;
  /** Cuts the current pause short. */
  let nap: AbortController | undefined;
  /** Ends the current connection, so the loop reconnects. */
  let connection: AbortController | undefined;
  let heardAt = performance.now();

  const stream: Stream = {
    followers,
    state: "connecting",
    stop() {
      life.abort();
      if (streams.get(url) === stream) streams.delete(url);
      unwatchLifecycle();
    },
    resume() {
      nap?.abort();
      if (stream.state === "open" && performance.now() - heardAt >= silenceMs) connection?.abort();
    },
  };

  const setState = (state: StreamState) => {
    if (state === stream.state) return;
    const missed = state === "open" && dropped;
    if (state === "open") dropped = false;
    stream.state = state;
    for (const follower of followers) follower.onState?.(state, missed);
  };

  const end = (status: 401 | 404) => {
    const ending = [...followers];
    stream.stop();
    for (const follower of ending) follower.onEnd?.(status);
  };

  /** One connection, until it ends; answers the status that ends the stream for good, if any. */
  async function connect(): Promise<401 | 404 | undefined> {
    const current = new AbortController();
    connection = current;
    const signal = AbortSignal.any([life.signal, current.signal]);
    let silence: ReturnType<typeof setTimeout> | undefined;
    const heard = () => {
      heardAt = performance.now();
      clearTimeout(silence);
      silence = setTimeout(() => current.abort(), silenceMs);
    };
    try {
      heard();
      const response = await fetch(url, { signal });
      if (response.status === 401 || response.status === 404) return response.status;
      if (!response.ok || !response.body) return undefined;
      attempt = 0;
      setState("open");
      for await (const event of readEventStream(response.body, heard)) {
        for (const follower of followers) follower.onEvent?.(event);
      }
      return undefined;
    } finally {
      clearTimeout(silence);
      current.abort();
    }
  }

  async function pause(): Promise<void> {
    const cap = Math.min(backoff.maxMs, backoff.minMs * 2 ** attempt);
    attempt += 1;
    nap = new AbortController();
    const done = AbortSignal.any([life.signal, nap.signal]);
    await new Promise<void>((resolve) => {
      const wait = setTimeout(finish, Math.random() * cap);
      done.addEventListener("abort", finish, { once: true });
      function finish() {
        clearTimeout(wait);
        done.removeEventListener("abort", finish);
        resolve();
      }
    });
    nap = undefined;
  }

  void (async () => {
    while (!life.signal.aborted) {
      let ended: 401 | 404 | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop
        ended = await connect();
      } catch {
        // A dropped or failed connection: reconnect below.
      }
      if (life.signal.aborted) return;
      if (ended) {
        end(ended);
        return;
      }
      dropped = true;
      setState("retrying");
      // oxlint-disable-next-line no-await-in-loop
      await pause();
    }
  })();

  return stream;
}

/** The page's lifecycle, watched while any stream is open. */
const resumeWhenShown = () => {
  if (!document.hidden) resumeStreams();
};
let watching = false;

function watchLifecycle(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("online", resumeStreams);
  document.addEventListener("visibilitychange", resumeWhenShown);
  document.addEventListener("resume", resumeWhenShown);
}

function unwatchLifecycle(): void {
  if (!watching || streams.size > 0) return;
  watching = false;
  window.removeEventListener("online", resumeStreams);
  document.removeEventListener("visibilitychange", resumeWhenShown);
  document.removeEventListener("resume", resumeWhenShown);
}
