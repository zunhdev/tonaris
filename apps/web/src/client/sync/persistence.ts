// What the client keeps in the browser across reloads (TS-22, TS-24): the outbox's unanswered writes, so a reload
// or a closed tab doesn't lose them, and the conflicts waiting for review (FR-09.4). One IndexedDB database per
// account, so another account signing in on the same browser never sees them. Collection data isn't kept: a reload
// bootstraps again, and offline use isn't promised (PRD section 2.3).

import { z } from "zod";

import { fieldConflictSchema, mutationSchema } from "@tonaris/domain";

const outboxItemSchema = z.object({ mutation: mutationSchema, key: z.string() });

/** One write and the record it changes, as the collection keys it. */
export type OutboxItem = z.infer<typeof outboxItemSchema>;

const outboxEntrySchema = z.object({
  id: z.string(),
  tab: z.string(),
  createdAt: z.number(),
  items: z.array(outboxItemSchema).min(1),
});

/** One transaction's writes, owned by the tab that sends them. `createdAt` orders entries across tabs. */
export type OutboxEntry = z.infer<typeof outboxEntrySchema>;

const storedConflictSchema = outboxItemSchema.extend({
  outcome: z.object({
    status: z.literal("conflict"),
    conflicts: z.array(fieldConflictSchema).min(1),
  }),
});

/** An attempt that met a newer saved value, kept until the person reviews it. */
export type StoredConflict = z.infer<typeof storedConflictSchema>;

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
  /** Deletes everything kept for the account, as signing out does. */
  clear(): Promise<void>;
};

const byAge = (a: OutboxEntry, b: OutboxEntry) => a.createdAt - b.createdAt;

/** Kept in memory only: for tests, and for browsers where IndexedDB can't be opened. */
export function memoryPersistence(): SyncPersistence {
  const entries = new Map<string, OutboxEntry>();
  const conflicts = new Map<string, StoredConflict>();
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
    clear() {
      entries.clear();
      conflicts.clear();
      return Promise.resolve();
    },
  };
}

/** The account's database name. */
export const syncDatabaseName = (accountId: string) => `tonaris-sync:${accountId}`;

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

/** Opens the database; `onClosed` runs when another tab deletes it (signing out), which needs it closed. */
function openDatabase(name: string, onClosed: () => void): Promise<IDBDatabase> {
  const request = indexedDB.open(name, 1);
  request.addEventListener("upgradeneeded", () => {
    request.result.createObjectStore("outbox", { keyPath: "id" });
    request.result.createObjectStore("conflicts", { keyPath: "mutation.mutationId" });
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
    store: "outbox" | "conflicts",
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
    async clear() {
      if (opened) (await opened).close();
      opened = undefined;
      await settled(indexedDB.deleteDatabase(name));
    },
  };
}
