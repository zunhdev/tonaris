// The albums collection: a TanStack DB custom sync collection over the sync protocol (TS-24). The engine fills it
// from the bootstrap snapshot and the stream; inserts and updates are optimistic, and each becomes one mutation
// envelope whose `base` is the record's value before the edit (TS-21).

import { createCollection } from "@tanstack/db";

import { albumFields, uuidv7, type Album, type AlbumFields, type Mutation } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { Writer } from "./writer";

/** The album's own fields only, whatever else the draft carried. */
function albumOf(value: Album): Album {
  const { id, title, artistCredit, releaseType, isLive, originalYear } = value;
  const { recordingYearStart, recordingYearEnd, artworkUrl } = value;
  return {
    id,
    title,
    artistCredit,
    releaseType,
    isLive,
    originalYear,
    recordingYearStart,
    recordingYearEnd,
    artworkUrl,
  };
}

/** The fields an update changed, and their values before it: the mutation's `args` and `base`. */
function updateOf(
  original: Album,
  changes: Partial<Album>,
): Pick<Mutation & { name: "album.update" }, "args" | "base"> {
  const args: Partial<AlbumFields> = {};
  const base: Partial<AlbumFields> = {};
  for (const field of albumFields) {
    if (changes[field] === undefined) continue;
    Object.assign(args, { [field]: changes[field] });
    Object.assign(base, { [field]: original[field] });
  }
  return { args: { ...args, id: original.id }, base };
}

export function createAlbumCollection({ engine, writer }: { engine: SyncEngine; writer: Writer }) {
  return createCollection<Album, string>({
    id: "albums",
    getKey: (album) => album.id,
    // The engine feeds every store from one stream, so the collection subscribes as soon as it exists and stays.
    startSync: true,
    gcTime: 0,
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady, truncate }) => {
        // Keys in the synced state, so a change is written as an insert or an update as TanStack DB expects.
        const synced = new Set<string>();
        const unregister = engine.register({
          reset(snapshot) {
            begin();
            truncate();
            synced.clear();
            for (const album of snapshot.albums) {
              write({ type: "insert", value: album });
              synced.add(album.id);
            }
            void commit();
            markReady();
          },
          apply(change) {
            if (change.entity !== "album") return;
            begin();
            if (change.data === null) {
              if (synced.delete(change.id)) write({ type: "delete", key: change.id });
            } else {
              write({ type: synced.has(change.id) ? "update" : "insert", value: change.data });
              synced.add(change.id);
            }
            void commit();
          },
        });
        return () => {
          unregister();
        };
      },
    },
    onInsert: ({ transaction }) =>
      writer.persist(
        transaction,
        transaction.mutations.map((pending) => ({
          key: pending.key,
          mutation: { mutationId: uuidv7(), name: "album.create", args: albumOf(pending.modified) },
        })),
      ),
    onUpdate: ({ transaction }) =>
      writer.persist(
        transaction,
        transaction.mutations.map((pending) => ({
          key: pending.key,
          mutation: {
            mutationId: uuidv7(),
            name: "album.update",
            ...updateOf(pending.original, pending.changes),
          },
        })),
      ),
  });
}

export type AlbumCollection = ReturnType<typeof createAlbumCollection>;
