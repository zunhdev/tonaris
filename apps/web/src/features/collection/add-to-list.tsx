// "Add to list…" (DS-46, DS-49): the owner's lists an album isn't in yet, with their folders, for L and the
// inspector's "+ Add to list". Choosing one puts the album in it (FR-01.6), announced (DS-83). For the selection
// (TON-231), the lists not all of them are in: the others join in one batch, with Undo. Adding is an edit:
// whatever opens it switches to Editing first, and it waits while offline (DS-81).
// There can be thousands of lists (TON-177), so "Find a list" finds them by typing (`ListFinder`).

import { sent } from "@/client/sync/writer";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useMemo, useRef, type RefObject } from "react";

import { membershipKey, type Album, type Container } from "@tonaris/domain";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";

import { useCollectionDialogs } from "./collection-dialogs";
import { useCollectionData } from "./data";
import { ListFinder } from "./list-finder";
import { listChoices } from "./list-picker";

/** The time an entry is made; the server records its own (TON-27). */
const now = () => new Date().toISOString();

export function AddToListDialog() {
  const { addingToList, endAddToList } = useCollectionDialogs();
  const { albumsById } = useCollectionData();
  const field = useRef<HTMLInputElement>(null);
  const albums = (addingToList ?? []).flatMap((id) => albumsById.get(id) ?? []);

  return (
    <Dialog
      open={albums.length > 0}
      onOpenChange={(open) => {
        if (!open) endAddToList();
      }}
    >
      {/* The field when there are lists to offer; with none, the dialog itself, so Esc closes it there. */}
      <DialogContent initialFocus={() => field.current ?? true}>
        {/* Keyed, so each opening starts with an empty field. */}
        {albums.length > 0 && (
          <ListPicker
            key={albums.map((album) => album.id).join()}
            albums={albums}
            field={field}
            onAdded={endAddToList}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListPicker({
  albums,
  field,
  onAdded,
}: {
  albums: readonly Album[];
  field: RefObject<HTMLInputElement | null>;
  onAdded: () => void;
}) {
  const client = useSyncClient();
  const announce = useAnnounce();
  const notify = useNotify();
  const { tree, listsByAlbum } = useCollectionData();
  // A list every one of them is in already isn't offered; one some are in takes the others.
  const choices = useMemo(() => {
    const [first, ...rest] = albums;
    const inAll = (listsByAlbum.get(first?.id ?? "") ?? []).filter((listId) =>
      rest.every((album) => (listsByAlbum.get(album.id) ?? []).includes(listId)),
    );
    return listChoices(tree, inAll);
  }, [albums, tree, listsByAlbum]);
  const [only] = albums;
  const one = albums.length === 1 ? only : undefined;

  function add(list: Container) {
    if (!client) return;
    const adding = albums.filter((album) => !(listsByAlbum.get(album.id) ?? []).includes(list.id));
    if (adding.length === 0) return;
    const addedAt = now();
    // One write for all of them: the outbox sends several as one batch (TS-25).
    sent(
      client.memberships.insert(
        adding.map((album) => ({ listId: list.id, albumId: album.id, addedAt })),
      ),
    );
    onAdded();
    if (one) {
      announce(`Added ${one.title} to ${list.name}`);
      return;
    }
    announce(`Added ${adding.length} albums to ${list.name}`);
    // Several at once can be taken back, as removing several can (TON-231).
    notify?.undo({
      title: `${adding.length} albums added to ${list.name}`,
      onUndo: () => {
        sent(client.memberships.delete(adding.map((album) => membershipKey(list.id, album.id))));
      },
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {one ? `Add '${one.title}' to a list` : `Add ${albums.length} albums to a list`}
        </DialogTitle>
        <DialogDescription>
          {choices.length > 0
            ? one
              ? "It stays in its other lists too."
              : "They stay in their other lists too."
            : one
              ? "It's in every list already, or there are no lists yet."
              : "They're all in every list already, or there are no lists yet."}
        </DialogDescription>
      </DialogHeader>
      {choices.length > 0 && (
        <ListFinder
          choices={choices}
          field={field}
          onChoose={(list) => {
            if (list) add(list);
          }}
        />
      )}
    </>
  );
}
