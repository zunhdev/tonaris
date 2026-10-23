// Moving folders and lists (FR-01.4, FR-01.5, DS-49): "Move to…", which `M` opens for the focused folder or list,
// and the move itself, shared with dropping onto the tree. A move is a collection edit: it waits while offline
// (DS-81), and the domain checks names and depth, reporting a refusal as any write (DS-107). The moved item arrives
// last in its destination's arrangement (DS-51), the destination opens in the tree, and the move is announced.

import { useAnnounce } from "@/features/sync/announcer";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { FolderClosed, Library } from "lucide-react";
import { useCallback, useMemo, useRef, type KeyboardEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionUi } from "./collection-ui";
import { useCollectionData } from "./data";
import { ancestorsOf, canMoveInto, moveDestinations } from "./tree";

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
      client.containers
        .update(id, (draft) => {
          draft.parentId = parentId;
        })
        // The save-state layer reports a move that isn't saved.
        .isPersisted.promise.catch(() => {});
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
  const list = useRef<HTMLUListElement>(null);
  const item = moving === undefined ? undefined : tree.byId.get(moving);
  const destinations = useMemo(
    () => (moving === undefined ? [] : moveDestinations(tree, moving)),
    [tree, moving],
  );

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...(list.current?.querySelectorAll("button") ?? [])];
    const at = buttons.findIndex((button) => button === document.activeElement);
    const next =
      event.key === "ArrowDown" ? Math.min(at + 1, buttons.length - 1) : Math.max(at - 1, 0);
    buttons[next]?.focus();
  }

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
                {destinations.length > 0
                  ? "It moves with everything in it."
                  : "There's nowhere else to move it yet. Create a folder first."}
              </DialogDescription>
            </DialogHeader>
            {destinations.length > 0 && (
              // The choices are buttons, so Tab and the arrows both move between them.
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <ul
                ref={list}
                aria-label="Places"
                className="flex max-h-80 flex-col overflow-y-auto"
                onKeyDown={onKeyDown}
              >
                {destinations.map((destination) => {
                  const Icon = destination.parentId === null ? Library : FolderClosed;
                  return (
                    <li key={destination.parentId ?? "root"}>
                      <button
                        type="button"
                        className={cn(
                          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid",
                        )}
                        style={{ paddingLeft: 8 + destination.level * 16 }}
                        onClick={() => {
                          if (move(item.id, destination.parentId)) endMove();
                        }}
                      >
                        <Icon
                          aria-hidden
                          strokeWidth={1.5}
                          className="size-4 shrink-0 text-fg-secondary"
                        />
                        <span className="truncate">{destination.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
