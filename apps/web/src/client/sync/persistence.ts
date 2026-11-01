// What the client keeps in the browser across reloads (TS-22, TS-24): the outbox's unanswered writes, so a reload
// or a closed tab doesn't lose them, and the conflicts, failures and batch reports waiting for the person (FR-09.4,
// FR-13.2, FR-13.4). One
// IndexedDB database per account, so another account signing in on the same browser never sees them. Collection data isn't kept: a reload
// bootstraps again, and offline use isn't promised (PRD section 2.3).

import { z } from "zod";

import {
  conflictOutcomeSchema,
  failedOutcomeSchema,
  mutationSchema,
  needsInputOutcomeSchema,
  outcomeSchema,
} from "@tonaris/domain";

const outboxItemSchema = z.object({ mutation: mutationSchema, key: z.string() });

/** One write and the record it changes, as the collection keys it. */
export type OutboxItem = z.infer<typeof outboxItemSchema>;

const outboxEntrySchema = z.object({
  id: z.string(),
  tab: z.string(),
  /** The outbox lane it is sent in, such as `capture`; none for the main lane. */
  lane: z.string().optional(),
  createdAt: z.number(),
  items: z.array(outboxItemSchema).min(1),
});

/**
 * One transaction's writes, owned by the tab that sends them. `createdAt` orders entries across tabs, and across
 * lanes.
 */
export type OutboxEntry = z.infer<typeof outboxEntrySchema>;

// The kept outcomes are the domain's own members of `outcomeSchema`: Zod drops the keys a schema doesn't name, so a
// copy here would lose a field added there on the next reload.
export const storedConflictSchema = outboxItemSchema.extend({ outcome: conflictOutcomeSchema });

/** An attempt that met a newer saved value, kept until the person reviews it. */
export type StoredConflict = z.infer<typeof storedConflictSchema>;

export const storedFailureSchema = outboxItemSchema.extend({
  // A capture waiting for the person's choice or details keeps its link the same way (TON-45).
  outcome: z.discriminatedUnion("status", [failedOutcomeSchema, needsInputOutcomeSchema]),
});

/**
 * A write the server rejected, or one waiting for the person's input, kept until the person retries, completes or
 * dismisses it (FR-13.2, FR-02.10, DS-80).
 */
export type StoredFailure = z.infer<typeof storedFailureSchema>;

const storedBatchSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  items: z.array(outboxItemSchema.extend({ outcome: outcomeSchema })).min(1),
});

/**
 * A batch report in which something didn't save, kept until dismissed (DS-84): its writes that have an outcome, in
 * the order they were made. Writes still underway are the outbox's.
 */
export type StoredBatch = z.infer<typeof storedBatchSchema>;

/** The records that are what they should be; one an older version left in another shape is skipped. */
function valid<T>(schema: z.ZodType<T>, records: unknown[]): T[] {
  return records.flatMap((record) => {
    const parsed = schema.safeParse(record);
    return parsed.success ? [parsed.data] : [];
  });
}

export type SyncPersistence = {
  /** Every tab's entries, oldest first. */
  entries(): Promise<OutboxEntry[]>;
  putEntry(entry: OutboxEntry): Promise<void>;
  deleteEntry(id: string): Promise<void>;
  conflicts(): Promise<StoredConflict[]>;
  putConflict(conflict: StoredConflict): Promise<void>;
  deleteConflict(mutationId: string): Promise<void>;
  failures(): Promise<StoredFailure[]>;
  putFailure(failure: StoredFailure): Promise<void>;
  deleteFailure(mutationId: string): Promise<void>;
  /** The kept batch reports, oldest first. */
  batches(): Promise<StoredBatch[]>;
  putBatch(batch: StoredBatch): Promise<void>;
  deleteBatch(id: string): Promise<void>;
  /** Deletes everything kept for the account, as signing out does. */
  clear(): Promise<void>;
};

const byAge = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt;

/** Kept in memory only: for tests, and for browsers where IndexedDB can't be opened. */
export function memoryPersistence(): SyncPersistence {
  const entries = new Map<string, OutboxEntry>();
  const conflicts = new Map<string, StoredConflict>();
  const failures = new Map<string, StoredFailure>();
  const batches = new Map<string, StoredBatch>();
  return {
    entries: () =>
      Promise.resolve([...entries.values()].map((entry) => structuredClone(entry)).toSorted(byAge)),
    putEntry(entry) {
      entries.set(entry.id, structuredClone(entry));
      return Promise.resolve();
    },
    deleteEntry(id) {
      entries.delete(id);
      return Promise.resolve();
    },
    conflicts: () =>
      Promise.resolve([...conflicts.values()].map((conflict) => structuredClone(conflict))),
    putConflict(conflict) {
      conflicts.set(conflict.mutation.mutationId, structuredClone(conflict));
      return Promise.resolve();
    },
    deleteConflict(mutationId) {
      conflicts.delete(mutationId);
      return Promise.resolve();
    },
    failures: () =>
      Promise.resolve([...failures.values()].map((failure) => structuredClone(failure))),
    putFailure(failure) {
      failures.set(failure.mutation.mutationId, structuredClone(failure));
      return Promise.resolve();
    },
    deleteFailure(mutationId) {
      failures.delete(mutationId);
      return Promise.resolve();
    },
    batches: () =>
      Promise.resolve([...batches.values()].map((batch) => structuredClone(batch)).toSorted(byAge)),
    putBatch(batch) {
      batches.set(batch.id, structuredClone(batch));
      return Promise.resolve();
    },
    deleteBatch(id) {
      batches.delete(id);
      return Promise.resolve();
    },
    clear() {
      entries.clear();
      conflicts.clear();
      failures.clear();
      batches.clear();
      return Promise.resolve();
    },
  };
}

/** The account's database name. */
const syncDatabaseName = (accountId: string) => `tonaris-sync:${accountId}`;

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

/**
 * Opens the database; `onClosed` runs when another tab deletes it (signing out) or upgrades it, which needs it
 * closed. Version 1 kept the outbox and conflicts; version 2 (TON-31) adds failures, and version 3 (TON-32) batch
 * reports.
 */
function openDatabase(name: string, onClosed: () => void): Promise<IDBDatabase> {
  const request = indexedDB.open(name, 3);
  request.addEventListener("upgradeneeded", (event) => {
    const database = request.result;
    if (event.oldVersion < 1) {
      database.createObjectStore("outbox", { keyPath: "id" });
      database.createObjectStore("conflicts", { keyPath: "mutation.mutationId" });
    }
    if (event.oldVersion < 2)
      database.createObjectStore("failures", { keyPath: "mutation.mutationId" });
    if (event.oldVersion < 3) database.createObjectStore("batches", { keyPath: "id" });
  });
  return settled(request).then((database) => {
    database.addEventListener("versionchange", () => {
      database.close();
      onClosed();
    });
    return database;
  });
}

/** The account's database in this browser. Opened on first use; `clear()` deletes it. */
export function indexedDbPersistence(accountId: string): SyncPersistence {
  const name = syncDatabaseName(accountId);
  let opened: Promise<IDBDatabase> | undefined;
  // Opened again on next use once another tab deleted it.
  const database = () =>
    (opened ??= openDatabase(name, () => {
      opened = undefined;
    }));

  async function inStore<T>(
    store: "outbox" | "conflicts" | "failures" | "batches",
    mode: IDBTransactionMode,
    act: (objects: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const transaction = (await database()).transaction(store, mode);
    const result = settled(act(transaction.objectStore(store)));
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () => reject(transaction.error));
    });
    return result;
  }

  return {
    entries: async () =>
      valid(
        outboxEntrySchema,
        await inStore("outbox", "readonly", (objects) => objects.getAll()),
      ).toSorted(byAge),
    putEntry: (entry) =>
      inStore("outbox", "readwrite", (objects) => objects.put(entry)).then(() => undefined),
    deleteEntry: (id) => inStore("outbox", "readwrite", (objects) => objects.delete(id)),
    conflicts: async () =>
      valid(
        storedConflictSchema,
        await inStore("conflicts", "readonly", (objects) => objects.getAll()),
      ),
    putConflict: (conflict) =>
      inStore("conflicts", "readwrite", (objects) => objects.put(conflict)).then(() => undefined),
    deleteConflict: (mutationId) =>
      inStore("conflicts", "readwrite", (objects) => objects.delete(mutationId)),
    failures: async () =>
      valid(
        storedFailureSchema,
        await inStore("failures", "readonly", (objects) => objects.getAll()),
      ),
    putFailure: (failure) =>
      inStore("failures", "readwrite", (objects) => objects.put(failure)).then(() => undefined),
    deleteFailure: (mutationId) =>
      inStore("failures", "readwrite", (objects) => objects.delete(mutationId)),
    batches: async () =>
      valid(
        storedBatchSchema,
        await inStore("batches", "readonly", (objects) => objects.getAll()),
      ).toSorted(byAge),
    putBatch: (batch) =>
      inStore("batches", "readwrite", (objects) => objects.put(batch)).then(() => undefined),
    deleteBatch: (id) => inStore("batches", "readwrite", (objects) => objects.delete(id)),
    async clear() {
      if (opened) (await opened).close();
      opened = undefined;
      await settled(indexedDB.deleteDatabase(name));
    },
  };
}
