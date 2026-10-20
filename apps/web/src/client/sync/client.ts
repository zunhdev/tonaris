// One signed-in client's sync: the engine on the stream, the outbox for writes, the save states, and the
// collections. The web app makes one per browser tab today; TON-30 shares one stream across tabs (TS-23).

import { createAlbumCollection } from "./albums";
import { createSyncEngine, type Fetch, type SyncEngineOptions } from "./engine";
import { createOutbox } from "./outbox";
import { mutationSender } from "./transport";
import { createSaveStates, createWriter } from "./writer";

export type SyncClientOptions = SyncEngineOptions & {
  /** How long a mutation request may take before it counts as unanswered. */
  requestTimeoutMs?: number;
  /** How long a write may take to reach the stream before it shows as unconfirmed (TS-24). */
  confirmWithinMs?: number;
};

export type SyncClient = ReturnType<typeof createSyncClient>;

export function createSyncClient(options: SyncClientOptions) {
  const engine = createSyncEngine(options);
  const states = createSaveStates();
  const outbox = createOutbox({
    send: mutationSender(options.apiUrl, options.fetch, { timeoutMs: options.requestTimeoutMs }),
    backoff: options.backoff,
    onState: (mutation, state) => states.queued(mutation, state),
  });
  // A connection that is back is the moment to retry what went unanswered.
  engine.onStatus((status) => {
    if (status === "live") outbox.wake();
  });
  const writer = createWriter({ outbox, engine, states, confirmWithinMs: options.confirmWithinMs });
  const albums = createAlbumCollection({ engine, writer });

  return {
    engine,
    outbox,
    states,
    albums,
    start: () => engine.start(),
    async stop(): Promise<void> {
      engine.stop();
      outbox.stop();
      await albums.cleanup();
    },
  };
}

/** The browser's fetch, with the session cookie on every request to the API (TS-08). */
export const browserFetch: Fetch = (url, init) => fetch(url, { ...init, credentials: "include" });
