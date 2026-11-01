// The albums collection: a TanStack DB collection over the snapshot and the stream (TS-24, snapshot.ts). Inserts
// and updates are optimistic, and each becomes one mutation envelope whose `base` is the record's value before the
// edit (TS-21). The artwork URL has its own mutation, `album.setArtwork` (TON-48): an album made with artwork sends
// it after `album.create`, in the same request.

import { albumFields, type Album, type Mutation } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";
import { diffFields, envelope, pick } from "./writes";

/** The write that sets an album's artwork over `base`, the URL the client last saw (TON-48). */
const artworkWrite = (id: string, artworkUrl: string | null, base: string | null) =>
  envelope("album.setArtwork", { id, artworkUrl }, { artworkUrl: base });

/** The writes an edit makes: `album.update` for the fields it changed, and `album.setArtwork` for new artwork. */
function updatesOf(original: Album, changes: Partial<Album>): Mutation[] {
  const update = diffFields(albumFields, original, changes);
  const artwork = changes.artworkUrl !== undefined && changes.artworkUrl !== original.artworkUrl;
  return [
    ...(update ? [envelope("album.update", { ...update.args, id: original.id }, update.base)] : []),
    ...(artwork
      ? [artworkWrite(original.id, changes.artworkUrl ?? null, original.artworkUrl)]
      : []),
  ];
}

export function createAlbumCollection({ engine, writer }: { engine: SyncEngine; writer: Writer }) {
  return snapshotCollection({
    engine,
    id: "albums",
    entity: "album",
    rows: (snapshot) => snapshot.albums,
    getKey: (album) => album.id,
    handlers: {
      // `album.create` takes the album's own fields and ID, whatever else the draft carried.
      onInsert: ({ transaction }) =>
        writer.persistEach(transaction, ({ modified }) => [
          envelope("album.create", { ...pick(modified, albumFields), id: modified.id }),
          ...(modified.artworkUrl ? [artworkWrite(modified.id, modified.artworkUrl, null)] : []),
        ]),
      onUpdate: ({ transaction }) =>
        writer.persistEach(transaction, ({ original, changes }) => updatesOf(original, changes)),
    },
  });
}

export type AlbumCollection = ReturnType<typeof createAlbumCollection>;
