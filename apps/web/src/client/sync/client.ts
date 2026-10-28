// One signed-in client's sync: the engine on the stream, the outbox for writes, the save states, and the
// collections: the collection's content with the albums' links, the custom fields and their values, and the person's
// view choices, defaults and manual order. The web app makes one per tab, for the signed-in account (src/features/sync). With tabs, the
// account's tabs share one stream, and the outbox and the review queue are kept in the browser, so a reload loses
// nothing: the next tab adopts what a gone tab left unsent (TS-22, TS-23). The client also tells changes saved
// elsewhere from this tab's own, for the views to highlight (DS-82).

import { createAlbumCollection } from "./albums";
import { createCaptures, type Captures } from "./captures";
import { createChangesElsewhere } from "./elsewhere";
import { createSyncEngine, type Fetch, type SyncEngineOptions } from "./engine";
import { createFieldValueCollection } from "./field-values";
import { createFieldCollection } from "./fields";
import { createLinkCollection } from "./links";
import { createContainerCollection, createMembershipCollection } from "./lists";
import { createOutbox } from "./outbox";
import { memoryPersistence, type SyncPersistence } from "./persistence";
import { createArrange, createPositionCollection } from "./positions";
import { entrySender } from "./transport";
import { createDefaultsCollection, createViewCollection } from "./views";
import { createSaveStates, createWriter } from "./writer";

export type SyncClientOptions = SyncEngineOptions & {
  /** How long a mutation request may take before it counts as unanswered. */
  requestTimeoutMs?: number;
  /** How long a capture's request may take, waiting on metadata sources, before it counts as unanswered. */
  captureTimeoutMs?: number;
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
  // Captures have a lane of their own: each waits for the edits made before it, and none holds up the edits after.
  const sendCapture = entrySender(options.apiUrl, options.fetch, {
    timeoutMs: options.captureTimeoutMs ?? 120_000,
  });
  let captures: Captures | undefined;
  const captureOutbox = createOutbox({
    lane: "capture",
    send: async (entry) => {
      await outbox.answeredBefore(entry.createdAt);
      return sendCapture(entry);
    },
    persistence,
    tab: options.tabs,
    backoff: options.backoff,
    onState: (mutation, state) => states.queued(mutation, state),
    onAdopted: (entry, outcomes) => captures?.restored(entry, outcomes),
  });
  captures = createCaptures({ outbox: captureOutbox, engine, states });
  /** Takes over gone tabs' unsent writes, lane by lane: a gone tab's lock is taken only when free. */
  const adopt = async () => {
    await outbox.adopt();
    await captureOutbox.adopt();
  };
  // A connection that is back is the moment to retry what went unanswered.
  engine.onStatus((status) => {
    if (status === "live") {
      outbox.wake();
      captureOutbox.wake();
    }
  });
  // The leader keeps looking for writes that tabs closed meanwhile left behind.
  let adopting: ReturnType<typeof setInterval> | undefined;
  engine.onLead(() => {
    void adopt();
    adopting = setInterval(() => void adopt(), adoptEveryMs);
  });
  const albums = createAlbumCollection({ engine, writer });
  const containers = createContainerCollection({ engine, writer });
  const memberships = createMembershipCollection({ engine, writer });
  const links = createLinkCollection({ engine, writer });
  const fields = createFieldCollection({ engine, writer });
  const fieldValues = createFieldValueCollection({ engine, writer });
  const views = createViewCollection({ engine, writer });
  const defaults = createDefaultsCollection({ engine, writer });
  const positions = createPositionCollection({ engine });
  // After the collections, so a listener hears of a change once its record is in them.
  const elsewhere = createChangesElsewhere({ engine, states });

  async function stop(): Promise<void> {
    clearInterval(adopting);
    elsewhere.stop();
    engine.stop();
    outbox.stop();
    captureOutbox.stop();
    options.tabs?.close();
    await Promise.all([
      albums.cleanup(),
      containers.cleanup(),
      memberships.cleanup(),
      links.cleanup(),
      fields.cleanup(),
      fieldValues.cleanup(),
      views.cleanup(),
      defaults.cleanup(),
      positions.cleanup(),
    ]);
  }

  return {
    engine,
    outbox,
    states,
    albums,
    containers,
    memberships,
    links,
    fields,
    fieldValues,
    views,
    defaults,
    positions,
    /** Writes one move in a view: each item's new key, or null to clear its place (TS-16). */
    arrange: createArrange({ positions, writer }),
    elsewhere,
    /** Sends captures (TON-45). */
    captures,
    /** Loads the kept conflicts, takes over gone tabs' unsent writes, and connects. */
    start(): void {
      void states.restore();
      void adopt();
      engine.start();
    },
    stop,
    /** The writes not yet answered: what signing out would discard. */
    get unsent(): number {
      return outbox.queued.length + captureOutbox.queued.length;
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
