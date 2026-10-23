// The album inspector (DS-46, DS-30): the album named by `?album=` beside the view, 380 px wide, or over it on a
// narrow window. Esc closes it, unless a field, dialog, popover or menu has the keys; so does Close. An album that
// is gone says so (DS-83's "removed elsewhere" pattern, until Trash says more).

import { X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

import { inLayer, isTextField } from "../shell/shortcuts";
import { AlbumDetails } from "./album-details";
import { useCollectionData } from "./data";
import { useInspector } from "./inspector-state";

export function AlbumInspector({ overlay }: { overlay: boolean }) {
  const { albumId, close } = useInspector();
  const { albumsById, ready } = useCollectionData();
  const album = albumId === undefined ? undefined : albumsById.get(albumId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isTextField(event.target) || inLayer(event.target)) return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <aside
      aria-label="Album"
      className={cn(
        "flex min-h-0 min-w-0 flex-col border-l border-subtle bg-panel",
        overlay && "fixed inset-y-0 right-0 z-50 w-[380px] max-w-full shadow-floating",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-subtle pr-2 pl-4">
        <span className="text-small font-medium text-fg-secondary">Album</span>
        <Button variant="ghost" size="icon" aria-label="Close album" onClick={close}>
          <X aria-hidden strokeWidth={1.5} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {album ? (
          <AlbumDetails key={album.id} album={album} />
        ) : (
          ready && <p className="p-4 text-fg-secondary">This album isn't available.</p>
        )}
      </div>
    </aside>
  );
}
