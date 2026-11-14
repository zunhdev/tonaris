// The selection bar (DS-50, TON-231): under a view's albums while some are selected, their count and what acts on all
// of them at once, each also a key: Add to list… (L), Remove from the list on view (⌫, in a list), Delete… (⌘⌫), and
// Clear selection (Esc). Each acts in one batch; nothing here works offline, as no edit does (DS-81).

import { ariaShortcut } from "@/common/shortcuts";
import { useConnection } from "@/features/sync/sync-provider";
import { X } from "lucide-react";

import { Button } from "@tonaris/ui/components/button";

import { useCollectionDialogs } from "./collection-dialogs";
import { useCollectionData } from "./data";
import { useRemoveFromList } from "./remove-from-list";
import type { AlbumSelection } from "./selection";

export function SelectionBar({
  selection,
  list,
}: {
  selection: AlbumSelection;
  /** The list on view, which "Remove from" takes them out of; none in Unsorted. */
  list: { id: string; name: string } | undefined;
}) {
  const { albumsById } = useCollectionData();
  const { startAddToList, startDeleteAlbums } = useCollectionDialogs();
  const removeFromList = useRemoveFromList();
  const offline = useConnection() === "offline";
  const { ids } = selection;
  if (ids.length === 0) return null;

  return (
    <fieldset
      aria-label="Selected albums"
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-subtle bg-panel px-4 py-2"
    >
      <span aria-live="polite" className="mr-auto text-fg-secondary tabular-nums">
        {ids.length === 1 ? "1 album selected" : `${ids.length} albums selected`}
      </span>
      <Button
        size="sm"
        disabled={offline}
        aria-keyshortcuts="L"
        onClick={() => startAddToList(ids)}
      >
        Add to list…
      </Button>
      {list && (
        <Button
          size="sm"
          disabled={offline}
          aria-keyshortcuts="Backspace"
          onClick={() => {
            removeFromList(
              ids.flatMap((id) => {
                const album = albumsById.get(id);
                return album ? [{ id, title: album.title }] : [];
              }),
              list,
            );
            // Acted on, the selection is done with: Undo brings the albums back unselected.
            selection.clear();
          }}
        >
          Remove from {list.name}
        </Button>
      )}
      <Button
        size="sm"
        variant="danger"
        disabled={offline}
        aria-keyshortcuts={ariaShortcut("Meta+Backspace")}
        onClick={() => startDeleteAlbums(ids)}
      >
        Delete…
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Clear selection"
        aria-keyshortcuts="Escape"
        onClick={selection.clear}
      >
        <X strokeWidth={1.5} />
      </Button>
    </fieldset>
  );
}
