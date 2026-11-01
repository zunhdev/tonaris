// "Add to list…" (DS-46, DS-49): the owner's lists an album isn't in yet, with their folders, for L and the
// inspector's "+ Add to list". Choosing one puts the album in it (FR-01.6), announced (DS-83). Adding is an edit:
// whatever opens it switches to Editing first, and it waits while offline (DS-81).

import { sent } from "@/client/sync/writer";
import { useAnnounce } from "@/features/sync/announcer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { ListMusic } from "lucide-react";
import { useMemo, useRef, type KeyboardEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";

import { useCollectionUi } from "./collection-ui";
import { useCollectionData } from "./data";
import { ancestorsOf } from "./tree";

/** The time an entry is made; the server records its own (TON-27). */
const now = () => new Date().toISOString();

export function AddToListDialog() {
  const client = useSyncClient();
  const announce = useAnnounce();
  const { addingToList, endAddToList } = useCollectionUi();
  const { tree, albumsById, listsByAlbum } = useCollectionData();
  const list = useRef<HTMLUListElement>(null);
  const album = addingToList === undefined ? undefined : albumsById.get(addingToList);

  const choices = useMemo(() => {
    if (!album) return [];
    const inLists = new Set(listsByAlbum.get(album.id));
    return [...tree.byId.values()]
      .filter((container) => container.kind === "list" && !inLists.has(container.id))
      .map((container) => ({
        list: container,
        path: [...ancestorsOf(tree, container.id).map((folder) => folder.name), container.name],
      }))
      .toSorted((a, b) => a.path.join(" › ").localeCompare(b.path.join(" › ")));
  }, [album, tree, listsByAlbum]);

  function add(listId: string, name: string) {
    if (!client || !album) return;
    sent(client.memberships.insert({ listId, albumId: album.id, addedAt: now() }));
    announce(`Added ${album.title} to ${name}`);
    endAddToList();
  }

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
      open={album !== undefined}
      onOpenChange={(open) => {
        if (!open) endAddToList();
      }}
    >
      <DialogContent>
        {album && (
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
              // The choices are buttons, so Tab and the arrows both move between them.
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <ul
                ref={list}
                aria-label="Lists"
                className="flex max-h-80 flex-col overflow-y-auto"
                onKeyDown={onKeyDown}
              >
                {choices.map(({ list: choice, path }) => (
                  <li key={choice.id}>
                    <button
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
                      onClick={() => add(choice.id, choice.name)}
                    >
                      <ListMusic
                        aria-hidden
                        strokeWidth={1.5}
                        className="size-4 shrink-0 text-fg-secondary"
                      />
                      <span className="truncate">
                        {path.length > 1 && (
                          <span className="text-fg-tertiary">
                            {path.slice(0, -1).join(" › ")} ›{" "}
                          </span>
                        )}
                        {choice.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
