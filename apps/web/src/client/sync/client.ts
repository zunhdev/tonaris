// One signed-in client's sync: the engine on the stream, the outbox for writes, the save states, and the
// collections: the collection's content, and the person's view choices and defaults. The web app makes one per tab, for the signed-in account (src/features/sync). With tabs, the
// account's tabs share one stream, and the outbox and the review queue are kept in the browser, so a reload loses
// nothing: the next tab adopts what a gone tab left unsent (TS-22, TS-23). The client also tells changes saved
// elsewhere from this tab's own, for the views to highlight (DS-82).

import { createAlbumCollection } from "./albums";
import { createChangesElsewhere } from "./elsewhere";
import { createSyncEngine, type Fetch, type SyncEngineOptions } from "./engine";
import { createContainerCollection, createMembershipCollection } from "./lists";
import { createOutbox } from "./outbox";
import { memoryPersistence, type SyncPersistence } from "./persistence";
import { entrySender } from "./transport";
import { createDefaultsCollection, createViewCollection } from "./views";
import { createSaveStates, createWriter } from "./writer";

export type SyncClientOptions = SyncEngineOptions & {
  /** How long a mutation request may take before it counts as unanswered. */
  requestTimeoutMs?: number;
  /** How long a write may take to reach the stream before it shows as unconfirmed (TS-24). */
  confirmWithinMs?: number;
  /** Where unsent writes and conflicts are kept; in memory by default, so a reload loses them. */
  persistence?: SyncPersistence;
  /** How often the leading tab looks for gone tabs' unsent writes. */
  adoptEveryMs?: number;
};

export type SyncClient = ReturnType<typeof createSyncClient>;

export function createSyncClient({
  persistence = memoryPersistence(),
  adoptEveryMs = 10_000,
  ...options
}: SyncClientOptions) {
  const engine = createSyncEngine(options);
  const states = createSaveStates({ persistence });
  let writer: ReturnType<typeof createWriter> | undefined;
  const outbox = createOutbox({
    send: entrySender(options.apiUrl, options.fetch, { timeoutMs: options.requestTimeoutMs }),
    persistence,
    tab: options.tabs,
    backoff: options.backoff,
    onState: (mutation, state) => states.queued(mutation, state),
    onAdopted: (entry, outcomes) => writer?.restored(entry, outcomes),
  });
  writer = createWriter({ outbox, engine, states, confirmWithinMs: options.confirmWithinMs });
  // A connection that is back is the moment to retry what went unanswered.
  engine.onStatus((status) => {
    if (status === "live") outbox.wake();
  });
  // The leader keeps looking for writes that tabs closed meanwhile left behind.
  let adopting: ReturnType<typeof setInterval> | undefined;
  engine.onLead(() => {
    void outbox.adopt();
    adopting = setInterval(() => void outbox.adopt(), adoptEveryMs);
  });
  const albums = createAlbumCollection({ engine, writer });
  const containers = createContainerCollection({ engine, writer });
  const memberships = createMembershipCollection({ engine, writer });
  const views = createViewCollection({ engine, writer });
  const defaults = createDefaultsCollection({ engine, writer });
  // After the collections, so a listener hears of a change once its record is in them.
  const elsewhere = createChangesElsewhere({ engine, states });

  async function stop(): Promise<void> {
    clearInterval(adopting);
    elsewhere.stop();
    engine.stop();
    outbox.stop();
    options.tabs?.close();
    await Promise.all([
      albums.cleanup(),
      containers.cleanup(),
      memberships.cleanup(),
      views.cleanup(),
      defaults.cleanup(),
    ]);
  }

  return {
    engine,
    outbox,
    states,
    albums,
    containers,
    memberships,
    views,
    defaults,
    elsewhere,
    /** Loads the kept conflicts, takes over gone tabs' unsent writes, and connects. */
    start(): void {
      void states.restore();
      void outbox.adopt();
      engine.start();
    },
    stop,
    /** The writes not yet answered: what signing out would discard. */
    get unsent(): number {
      return outbox.queued.length;
    },
    /** Stops, and deletes what this browser keeps for the account, as signing out does. */
    async clear(): Promise<void> {
      await stop();
      await persistence.clear();
    },
  };
}

/** The browser's fetch, with the session cookie on every request to the API (TS-08). */
export const browserFetch: Fetch = (url, init) => fetch(url, { ...init, credentials: "include" });
