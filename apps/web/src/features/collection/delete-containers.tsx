// Deleting folders and lists (DS-50; FR-01.11, X-07): a list moves to Trash at once, with "1 list moved to Trash" and
// Undo, which recovers it; a folder asks first, with the standard confirmation (DS-28): its hierarchy's counts and
// first names, that albums stay in their other lists or in Unsorted, and that Trash keeps it for 30 days. A page
// showing what went goes to the nearest folder still there, or the collection.

import { sent } from "@/client/sync/writer";
import { ConfirmDialog } from "@/common/confirm-dialog";
import { count } from "@/common/words";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useRecover } from "@/features/trash/recovery";

import { shareTopSentence, subtreeOf, trashRetentionDays, type Container } from "@tonaris/domain";

import { useCollectionDialogs } from "./collection-dialogs";
import { useViewContainerId } from "./collection-ui";
import { useCollectionData } from "./data";
import { useInspector } from "./inspector-state";
import { useCollectionPlace, useIsShareTop, useOpenContainer } from "./place";
import { ancestorsOf, type Tree } from "./tree";

/** The containers under `id`, nearest first: the walk the deletion itself takes (`subtreeOf`), so the count matches it. */
function descendants(tree: Tree, id: string): Container[] {
  return subtreeOf(tree.walks, id)
    .slice(1)
    .flatMap((each) => tree.byId.get(each) ?? []);
}

/** The owner's Trash, as a share's deletions name it (FR-07.20). */
const trashOf = (place: { ownerName: string | null }) =>
  place.ownerName === null ? "its owner's Trash" : `${place.ownerName}'s Trash`;

/** Leaves the page on view if it goes with `container`, its own or one inside it, for the nearest folder that stays. */
function useLeaveGoing(): (container: Container) => void {
  const open = useOpenContainer();
  const viewId = useViewContainerId();
  const { tree } = useCollectionData();
  return (container) => {
    const going =
      viewId !== undefined &&
      (viewId === container.id || ancestorsOf(tree, viewId).some((a) => a.id === container.id));
    if (!going) return;
    void open(container.parentId === null ? null : { id: container.parentId, kind: "folder" });
  };
}

/**
 * Deletes a folder or list: a list at once with Undo, a folder after confirming. Answers the function; a folder's
 * confirmation shows in `DeleteFolderDialog`.
 */
export function useDeleteContainer(): (id: string) => void {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  const leaveGoing = useLeaveGoing();
  const { tree } = useCollectionData();
  const { startDelete } = useCollectionDialogs();
  const recover = useRecover();
  const place = useCollectionPlace();
  const isShareTop = useIsShareTop();

  const offline = useConnection() === "offline";

  return (id: string) => {
    const container = tree.byId.get(id);
    // Like every edit, it waits while offline (DS-81).
    if (!client || !container || offline) return;
    // The shared folder or list itself stays where its owner put it (FR-07.20).
    if (isShareTop(id)) {
      notify?.info(shareTopSentence);
      return;
    }
    if (container.kind === "folder") {
      startDelete(id);
      return;
    }
    leaveGoing(container);
    const { transaction, deleted } = client.trash.deleteContainers([id]);
    sent(transaction);
    announce(`Moved ${container.name} to Trash`);
    notify?.undo({
      title: place.kind === "share" ? `1 list moved to ${trashOf(place)}` : "1 list moved to Trash",
      onUndo: () => {
        const [unit] = deleted.units;
        if (!unit) return;
        // Undo runs Trash recovery (DS-50): where it was if it can, asking otherwise.
        recover({
          ...unit,
          kind: container.kind,
          name: container.name,
          parentId: container.parentId,
          deleted,
        });
      },
    });
  };
}

/** The confirmation for deleting a folder (DS-50, DS-28), while one is asked for. */
export function DeleteFolderDialog() {
  const place = useCollectionPlace();
  const client = useSyncClient();
  const announce = useAnnounce();
  const leaveGoing = useLeaveGoing();
  const { tree } = useCollectionData();
  const { deleting, endDelete } = useCollectionDialogs();
  const folder = deleting === undefined ? undefined : tree.byId.get(deleting);
  const inside = folder ? descendants(tree, folder.id) : [];
  const folders = inside.filter((each) => each.kind === "folder").length;
  const lists = inside.length - folders;
  const names = inside.slice(0, 3).map((each) => each.name);

  const contents =
    inside.length === 0
      ? "The folder, which is empty"
      : `The folder and ${[folders > 0 && count(folders, "folder", "folders"), lists > 0 && count(lists, "list", "lists")].filter(Boolean).join(" and ")} inside it: ${names.join(", ")}${inside.length > names.length ? ", …" : ""}`;
  const moved = [
    count(folders + 1, "folder", "folders"),
    lists > 0 && count(lists, "list", "lists"),
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <ConfirmDialog
      confirmation={
        folder && {
          title: `Delete folder '${folder.name}'?`,
          scope: [contents],
          // An editor's goes to the owner's Trash, which only the owner opens (FR-07.20).
          consequences:
            place.kind === "share"
              ? [
                  "Albums stay in their other lists.",
                  `Only ${place.ownerName ?? "its owner"} can restore it, from their Trash.`,
                ]
              : [
                  "Albums stay in their other lists or in Unsorted.",
                  `Recoverable from Trash for ${trashRetentionDays} days.`,
                ],
          action: `Move ${moved} to ${place.kind === "share" ? trashOf(place) : "Trash"}`,
          onConfirm: () => {
            if (!client) return;
            leaveGoing(folder);
            sent(client.trash.deleteContainers([folder.id]).transaction);
            announce(`Moved ${folder.name} to Trash`);
          },
        }
      }
      onClose={endDelete}
    />
  );
}

/**
 * The confirmation for deleting an album from the collection (DS-50, FR-14.1), while one is asked for: it leaves every
 * list and Unsorted, and Trash keeps it for 30 days.
 */
export function DeleteAlbumDialog() {
  const place = useCollectionPlace();
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  // The inspector showing it closes, leaving the view's scrolling alone (inspector-state.ts, TON-118).
  const { close: closeInspector } = useInspector();
  const { albumsById, listsByAlbum, tree } = useCollectionData();
  const { deletingAlbum, endDeleteAlbum } = useCollectionDialogs();
  const album = deletingAlbum === undefined ? undefined : albumsById.get(deletingAlbum);
  const lists = (album === undefined ? [] : (listsByAlbum.get(album.id) ?? [])).flatMap(
    (listId) => tree.byId.get(listId)?.name ?? [],
  );

  // An editor's deletion takes it out of the share only; the owner's other lists keep it (FR-07.21).
  const share =
    place.kind === "share" ? (tree.byId.get(place.rootId)?.name ?? "this share") : undefined;
  if (share !== undefined && place.kind === "share") {
    return (
      <ConfirmDialog
        confirmation={
          album && {
            title: `Delete '${album.title}' from '${share}'?`,
            scope: [
              `It leaves ${count(lists.length, "list", "lists")}: ${lists.slice(0, 3).join(", ")}${lists.length > 3 ? ", …" : ""}.`,
            ],
            consequences: [
              `Removes it from every list in '${share}'.`,
              `${place.ownerName ?? "Its owner"}'s other lists keep it.`,
            ],
            action: "Delete",
            onConfirm: () => {
              if (!client) return;
              closeInspector();
              sent(client.trash.deleteAlbum(album.id).transaction);
              announce(`Deleted ${album.title} from ${share}`);
              notify?.info(`'${album.title}' left '${share}'`);
            },
          }
        }
        onClose={endDeleteAlbum}
      />
    );
  }
  return (
    <ConfirmDialog
      confirmation={
        album && {
          title: `Delete '${album.title}' from your collection?`,
          scope: [
            lists.length === 0
              ? "It leaves Unsorted."
              : `It leaves ${count(lists.length, "list", "lists")}: ${lists.slice(0, 3).join(", ")}${lists.length > 3 ? ", …" : ""}.`,
          ],
          consequences: [
            "Removes it from every list and Unsorted.",
            `Recoverable from Trash for ${trashRetentionDays} days.`,
          ],
          action: "Move to Trash",
          onConfirm: () => {
            if (!client) return;
            closeInspector();
            sent(client.trash.deleteAlbum(album.id).transaction);
            announce(`Moved ${album.title} to Trash`);
            notify?.info(`'${album.title}' moved to Trash`);
          },
        }
      }
      onClose={endDeleteAlbum}
    />
  );
}
