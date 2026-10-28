// Deleting folders and lists (DS-50; FR-01.11, X-07): a list moves to Trash at once, with "1 list moved to Trash" and
// Undo, which recovers it; a folder asks first, with the standard confirmation (DS-28): its hierarchy's counts and
// first names, that albums stay in their other lists or in Unsorted, and that Trash keeps it for 30 days. A page
// showing what went goes to the nearest folder still there, or the collection.

import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useNavigate } from "@tanstack/react-router";

import { trashRetentionDays, type Container } from "@tonaris/domain";

import { ConfirmDialog } from "../shell/confirm-dialog";
import { useCollectionUi, useViewContainerId } from "./collection-ui";
import { useCollectionData } from "./data";
import { ancestorsOf, type Tree } from "./tree";

/** The containers under `id`, nearest first. */
function descendants(tree: Tree, id: string): Container[] {
  const found: Container[] = [];
  const queue = [...(tree.children.get(id) ?? [])];
  for (let next = queue.shift(); next; next = queue.shift()) {
    found.push(next);
    queue.push(...(tree.children.get(next.id) ?? []));
  }
  return found;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Deletes a folder or list: a list at once with Undo, a folder after confirming. Answers the function; a folder's
 * confirmation shows in `DeleteFolderDialog`.
 */
export function useDeleteContainer(): (id: string) => void {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const viewId = useViewContainerId();
  const { tree } = useCollectionData();
  const { startDelete } = useCollectionUi();

  return (id: string) => {
    const container = tree.byId.get(id);
    if (!client || !container) return;
    if (container.kind === "folder") {
      startDelete(id);
      return;
    }
    // Off a page that is going, to the nearest folder that stays.
    if (
      viewId !== undefined &&
      (viewId === id || ancestorsOf(tree, viewId).some((a) => a.id === id))
    ) {
      void (container.parentId === null
        ? navigate({ to: "/c" })
        : navigate({ to: "/f/$folderId", params: { folderId: container.parentId } }));
    }
    const { transaction, deleted } = client.trash.deleteContainers([id]);
    transaction.isPersisted.promise.catch(() => {});
    announce(`Moved ${container.name} to Trash`);
    notify?.undo({
      title: "1 list moved to Trash",
      onUndo: () => {
        client.trash.recover(deleted).isPersisted.promise.catch(() => {});
        announce(`Recovered ${container.name}`);
      },
    });
  };
}

/** The confirmation for deleting a folder (DS-50, DS-28), while one is asked for. */
export function DeleteFolderDialog() {
  const client = useSyncClient();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const viewId = useViewContainerId();
  const { tree } = useCollectionData();
  const { deleting, endDelete } = useCollectionUi();
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
          consequences: [
            "Albums stay in their other lists or in Unsorted.",
            `Recoverable from Trash for ${trashRetentionDays} days.`,
          ],
          action: `Move ${moved} to Trash`,
          onConfirm: () => {
            if (!client) return;
            const going =
              viewId !== undefined &&
              (viewId === folder.id || ancestorsOf(tree, viewId).some((a) => a.id === folder.id));
            if (going) {
              void (folder.parentId === null
                ? navigate({ to: "/c" })
                : navigate({ to: "/f/$folderId", params: { folderId: folder.parentId } }));
            }
            client.trash
              .deleteContainers([folder.id])
              .transaction.isPersisted.promise.catch(() => {});
            announce(`Moved ${folder.name} to Trash`);
          },
        }
      }
      onClose={endDelete}
    />
  );
}
