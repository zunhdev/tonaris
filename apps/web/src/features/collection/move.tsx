// Moving folders and lists (FR-01.4, FR-01.5, DS-49): "Move to…", which `M` opens for the focused folder or list,
// and the move itself, shared with dropping onto the tree. Move to… previews what moving into the destination with
// the focus or the pointer would do to sharing, before choosing (DS-69, FR-07.14). A move is a collection edit: it waits while offline
// (DS-81), and the domain checks names and depth, reporting a refusal as any write (DS-107). The moved item arrives
// last in its destination's arrangement (DS-51), the destination opens in the tree, and the move is announced.

import { sent } from "@/client/sync/writer";
import { SharingImpactPreview } from "@/features/sharing/sharing-impact";
import { useAnnounce } from "@/features/sync/announcer";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useCallback, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";

import { useCollectionUi } from "./collection-ui";
import { useCollectionData } from "./data";
import { PlaceList } from "./place-list";
import { ancestorsOf, canMoveInto, destinations } from "./tree";

/** Moves the folder or list `id` into `parentId`, null being the root; answers whether it went. */
export function useMoveContainer(): (id: string, parentId: string | null) => boolean {
  const client = useSyncClient();
  const { tree } = useCollectionData();
  const { expand } = useCollectionUi();
  const announce = useAnnounce();
  const offline = useConnection() === "offline";
  return useCallback(
    (id, parentId) => {
      const item = tree.byId.get(id);
      if (!client || offline || !item || !canMoveInto(tree, id, parentId)) return false;
      sent(
        client.containers.update(id, (draft) => {
          draft.parentId = parentId;
        }),
      );
      if (parentId !== null)
        expand([...ancestorsOf(tree, parentId).map((folder) => folder.id), parentId]);
      const destination =
        parentId === null ? "Collection" : (tree.byId.get(parentId)?.name ?? "a folder");
      announce(`Moved ${item.name} to ${destination}`);
      return true;
    },
    [client, offline, tree, expand, announce],
  );
}

/** "Move {name} to…": Collection and the folders that can take the item, ↑ and ↓ between them, Enter to move. */
export function MoveDialog() {
  const { moving, endMove } = useCollectionUi();
  const { tree } = useCollectionData();
  const move = useMoveContainer();
  const item = moving === undefined ? undefined : tree.byId.get(moving);
  // The destination last focused or pointed at, for this item.
  const [previewed, setPreviewed] = useState<{ id: string; to: string | null }>();
  const preview = item !== undefined && previewed?.id === item.id ? previewed : undefined;
  const places = useMemo(
    () => (moving === undefined ? [] : destinations(tree, { moving })),
    [tree, moving],
  );

  return (
    <Dialog
      open={item !== undefined}
      onOpenChange={(open) => {
        if (!open) endMove();
      }}
    >
      <DialogContent>
        {item && (
          <>
            <DialogHeader>
              <DialogTitle>Move '{item.name}' to…</DialogTitle>
              <DialogDescription>
                {places.length > 0
                  ? "It moves with everything in it."
                  : "There's nowhere else to move it yet. Create a folder first."}
              </DialogDescription>
            </DialogHeader>
            {places.length > 0 && (
              <PlaceList
                mode="buttons"
                places={places}
                onFocus={(to) => setPreviewed({ id: item.id, to })}
                onChoose={(to) => {
                  if (move(item.id, to)) endMove();
                }}
              />
            )}
            <SharingImpactPreview
              query={preview === undefined ? undefined : { move: preview.id, to: preview.to }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
