// "Add to list…" (DS-46, DS-49): the owner's lists an album isn't in yet, with their folders, for L and the
// inspector's "+ Add to list". Choosing one puts the album in it (FR-01.6), announced (DS-83). Adding is an edit:
// whatever opens it switches to Editing first, and it waits while offline (DS-81).
// There can be thousands of lists (TON-177), so "Find a list" finds them by typing (`ListFinder`).

import { sent } from "@/client/sync/writer";
import { useAnnounce } from "@/features/sync/announcer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useMemo, useRef, type RefObject } from "react";

import type { Album, Container } from "@tonaris/domain";
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
  const album = addingToList === undefined ? undefined : albumsById.get(addingToList);

  return (
    <Dialog
      open={album !== undefined}
      onOpenChange={(open) => {
        if (!open) endAddToList();
      }}
    >
      <DialogContent initialFocus={field}>
        {/* Keyed, so each opening starts with an empty field. */}
        {album && <ListPicker key={album.id} album={album} field={field} onAdded={endAddToList} />}
      </DialogContent>
    </Dialog>
  );
}

function ListPicker({
  album,
  field,
  onAdded,
}: {
  album: Album;
  field: RefObject<HTMLInputElement | null>;
  onAdded: () => void;
}) {
  const client = useSyncClient();
  const announce = useAnnounce();
  const { tree, listsByAlbum } = useCollectionData();
  const choices = useMemo(
    () => listChoices(tree, listsByAlbum.get(album.id) ?? []),
    [album.id, tree, listsByAlbum],
  );

  function add(list: Container) {
    if (!client) return;
    sent(client.memberships.insert({ listId: list.id, albumId: album.id, addedAt: now() }));
    announce(`Added ${album.title} to ${list.name}`);
    onAdded();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add '{album.title}' to a list</DialogTitle>
        <DialogDescription>
          {choices.length > 0
            ? "It stays in its other lists too."
            : "It's in every list already, or there are no lists yet."}
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
