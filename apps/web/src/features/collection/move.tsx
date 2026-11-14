// Moving folders and lists (FR-01.4, FR-01.5, DS-49): "Move to…", which `M` opens for the focused folder or list,
// and the move itself, shared with dropping onto the tree. Move to… finds the destination by typing ("Find a folder",
// TON-183) and previews what moving into the active one would do to sharing, before choosing (DS-69, FR-07.14); the
// preview keeps room for two lines, and the dialog its top edge, so neither moves the folders under the pointer. A move
// is a collection edit: it waits while offline (DS-81), and the domain checks names and depth, reporting a refusal as
// any write (DS-107). The moved item arrives last in its destination's arrangement (DS-51), the destination opens in
// the tree and is remembered as a recent one on the device, and the move is announced. A move that would change who
// sees what, by Move to… or by dragging, waits for the owner's word, listing the change; one that changes nothing
// applies at once (DS-49, FR-07.14; TON-226).

import { sent } from "@/client/sync/writer";
import { ConfirmDialog } from "@/common/confirm-dialog";
import { recentFolders } from "@/common/device";
import { forgetImpacts, impactLines, readImpact } from "@/features/sharing/sharing-impact";
import { useAnnounce } from "@/features/sync/announcer";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useCallback, useMemo, useRef, type RefObject } from "react";

import { shareTopSentence, type SharingImpact } from "@tonaris/domain";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { pinnedDialogClass } from "@tonaris/ui/lib/floating";

import { useCollectionDialogs } from "./collection-dialogs";
import { useCollectionUi } from "./collection-ui";
import { useCollectionData } from "./data";
import { FolderFinder } from "./folder-finder";
import { folderChoices } from "./folder-picker";
import { useCollectionPlace, useIsShareTop } from "./place";
import { ancestorsOf, canMoveInto } from "./tree";

/** Moves the folder or list `id` into `parentId`, null being the root; answers whether it went. */
export function useMoveContainer(): (id: string, parentId: string | null) => boolean {
  const client = useSyncClient();
  const { tree } = useCollectionData();
  const { expand, accountId } = useCollectionUi();
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
      forgetImpacts();
      if (parentId !== null) {
        expand([...ancestorsOf(tree, parentId).map((folder) => folder.id), parentId]);
        recentFolders.record(accountId, parentId);
      }
      const destination =
        parentId === null ? "Collection" : (tree.byId.get(parentId)?.name ?? "a folder");
      announce(`Moved ${item.name} to ${destination}`);
      return true;
    },
    [client, offline, tree, expand, accountId, announce],
  );
}

/** Whether a move changes who sees what: someone newly sees it or stops, or, for an editor, the server says so. */
export function changesSharing(impact: SharingImpact): boolean {
  return impact.withheld ?? (impact.added.length > 0 || impact.removed.length > 0);
}

/**
 * Moves the folder or list `id` into `parentId` once its sharing is known: at once when nothing changes, else after
 * the owner confirms (TON-226). Answers whether the move can go there at all.
 */
export function useMoveWithConsent(): (id: string, parentId: string | null) => boolean {
  const move = useMoveContainer();
  const { tree } = useCollectionData();
  const { startConfirmMove } = useCollectionDialogs();
  const offline = useConnection() === "offline";
  return useCallback(
    (id, parentId) => {
      if (offline || !tree.byId.has(id) || !canMoveInto(tree, id, parentId)) return false;
      void readImpact({ move: id, to: parentId }).then(
        (impact) =>
          changesSharing(impact)
            ? startConfirmMove({ id, to: parentId, impact })
            : void move(id, parentId),
        // Unknown, it is asked about, saying so (DS-69).
        () => startConfirmMove({ id, to: parentId, impact: "failed" }),
      );
      return true;
    },
    [offline, tree, move, startConfirmMove],
  );
}

/** The confirmation for a move that would change who sees what, with the change and Move (DS-28, DS-49). */
export function MoveConfirmDialog() {
  const { confirmingMove, endConfirmMove } = useCollectionDialogs();
  const { tree } = useCollectionData();
  const move = useMoveContainer();
  const item = confirmingMove === undefined ? undefined : tree.byId.get(confirmingMove.id);
  const destination =
    confirmingMove?.to === null
      ? "Collection"
      : (tree.byId.get(confirmingMove?.to ?? "")?.name ?? "the folder");
  return (
    <ConfirmDialog
      confirmation={
        confirmingMove && item
          ? {
              title: `Move '${item.name}' to '${destination}'?`,
              scope: [item.kind === "folder" ? "The folder and everything in it" : "The list"],
              consequences:
                confirmingMove.impact === "failed"
                  ? ["Its sharing effects couldn't be checked."]
                  : impactLines(confirmingMove.impact),
              action: "Move",
              onConfirm: () => {
                move(confirmingMove.id, confirmingMove.to);
              },
            }
          : undefined
      }
      onClose={endConfirmMove}
    />
  );
}

/** "Move {name} to…": "Find a folder" over Collection and the folders that can take the item, Enter to move. */
export function MoveDialog() {
  const { moving, endMove } = useCollectionDialogs();
  const { tree } = useCollectionData();
  const field = useRef<HTMLInputElement>(null);
  const item = moving === undefined ? undefined : tree.byId.get(moving);

  return (
    <Dialog
      open={item !== undefined}
      onOpenChange={(open) => {
        if (!open) endMove();
      }}
    >
      <DialogContent initialFocus={field} className={pinnedDialogClass}>
        {/* Keyed, so each opening starts with an empty field. */}
        {item && <MovePicker key={item.id} id={item.id} name={item.name} field={field} />}
      </DialogContent>
    </Dialog>
  );
}

function MovePicker({
  id,
  name,
  field,
}: {
  id: string;
  name: string;
  field: RefObject<HTMLInputElement | null>;
}) {
  const { endMove } = useCollectionDialogs();
  const { tree } = useCollectionData();
  const move = useMoveWithConsent();
  const place = useCollectionPlace();
  // In a share, only its folders: never the top level, and never the shared folder or list itself (FR-07.20).
  const inShare = place.kind === "share";
  const top = useIsShareTop()(id);
  const choices = useMemo(
    () =>
      top
        ? []
        : folderChoices(tree, { moving: id }).filter(
            (choice) => !inShare || choice.parentId !== null,
          ),
    [tree, id, top, inShare],
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move '{name}' to…</DialogTitle>
        <DialogDescription>
          {top
            ? shareTopSentence
            : choices.length > 0
              ? "It moves with everything in it."
              : "There's nowhere else to move it yet. Create a folder first."}
        </DialogDescription>
      </DialogHeader>
      {choices.length > 0 && (
        <FolderFinder
          choices={choices}
          field={field}
          onChoose={(to) => {
            if (move(id, to)) endMove();
          }}
          impactOf={(to) => ({ move: id, to })}
        />
      )}
    </>
  );
}
