// Folder and list colors (DS-27, TON-175): eight, from a palette tuned for the dark theme, or none. A folder or list
// without its own color takes the nearest folder's above it (`effectiveColor`), in the tree, in folder rows and cards,
// and on the album panel's list chips. It's set from the ⋯ menu's Color submenu, or with ⌘K's "Color…", which opens
// this file's dialog; either is an edit, so it switches to Editing first (DS-45), and waits offline like any (DS-81).

import { sent } from "@/client/sync/writer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { Check } from "lucide-react";
import { useCallback } from "react";

import { containerColors, type ContainerColor } from "@tonaris/domain";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@tonaris/ui/components/dialog";

import { useCollectionDialogs } from "./collection-dialogs";
import { useMode } from "./collection-mode";
import { colorNames, ColorSwatch } from "./container-palette";
import { useCollectionData } from "./data";

/** Sets a folder's or list's own color, null for none, switching to Editing first (DS-45). */
export function useSetColor() {
  const client = useSyncClient();
  const { enterEditing } = useMode();
  return useCallback(
    (id: string, color: ContainerColor | null) => {
      if (!client?.containers.has(id)) return;
      enterEditing();
      sent(
        client.containers.update(id, (draft) => {
          draft.color = color;
        }),
      );
    },
    [client, enterEditing],
  );
}

/** ⌘K's "Color…": the colors, none first, the folder's or list's own marked; choosing one sets it and closes. */
export function ColorDialog() {
  const { coloring, endColor } = useCollectionDialogs();
  const { tree } = useCollectionData();
  const setColor = useSetColor();
  const item = coloring === undefined ? undefined : tree.byId.get(coloring);
  return (
    <Dialog
      open={item !== undefined}
      onOpenChange={(open) => {
        if (!open) endColor();
      }}
    >
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Color for {item?.name}</DialogTitle>
        </DialogHeader>
        <ul aria-label="Colors" className="flex flex-col gap-0.5">
          {[null, ...containerColors].map((color) => {
            const current = (item?.color ?? null) === color;
            return (
              <li key={color ?? "none"}>
                <button
                  type="button"
                  aria-pressed={current}
                  onClick={() => {
                    if (item) setColor(item.id, color);
                    endColor();
                  }}
                  className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
                >
                  <ColorSwatch color={color} />
                  <span className="flex-1">{color === null ? "None" : colorNames[color]}</span>
                  {current && <Check aria-hidden strokeWidth={1.5} className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
