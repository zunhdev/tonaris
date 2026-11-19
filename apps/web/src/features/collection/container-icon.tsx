// Folder and list icons (DS-27, TON-306): one of a fixed set in place of the folder or list glyph, or none. Unlike a
// color, an icon shows on its own folder or list only. The ⋯ menu's Icon… and ⌘K's Icon… open this file's picker:
// None and the icons in a grid, in the folder's or list's color, moved through with the arrow keys. Either is an edit,
// so it switches to Editing first (DS-45), and waits offline like any (DS-81).

import { sent } from "@/client/sync/writer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

import { containerIcons, type ContainerIconName } from "@tonaris/domain";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@tonaris/ui/components/dialog";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionDialogs } from "./collection-dialogs";
import { useMode } from "./collection-mode";
import { iconNames } from "./container-glyphs";
import { effectiveColor } from "./container-palette";
import { useCollectionData } from "./data";
import { ContainerIcon } from "./icons";

/** The picker's columns, which the arrow keys move across and down. */
const columns = 6;
const choices = [null, ...containerIcons] as const;

/** Sets a folder's or list's icon, null for none, switching to Editing first (DS-45). */
export function useSetIcon() {
  const client = useSyncClient();
  const { enterEditing } = useMode();
  return useCallback(
    (id: string, icon: ContainerIconName | null) => {
      if (!client?.containers.has(id)) return;
      enterEditing();
      sent(
        client.containers.update(id, (draft) => {
          draft.icon = icon;
        }),
      );
    },
    [client, enterEditing],
  );
}

/** Where an arrow, Home or End moves from `at` in the grid; undefined for any other key. */
export function movedTo(key: string, at: number, count: number): number | undefined {
  const last = count - 1;
  switch (key) {
    case "ArrowRight":
      return Math.min(at + 1, last);
    case "ArrowLeft":
      return Math.max(at - 1, 0);
    case "ArrowDown":
      return at + columns <= last ? at + columns : at;
    case "ArrowUp":
      return at - columns >= 0 ? at - columns : at;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return undefined;
  }
}

/** The Icon… picker: None and the icons, the folder's or list's own marked; choosing one sets it and closes. */
export function IconDialog() {
  const { choosingIcon, endIcon } = useCollectionDialogs();
  const { tree } = useCollectionData();
  const item = choosingIcon === undefined ? undefined : tree.byId.get(choosingIcon);
  return (
    <Dialog
      open={item !== undefined}
      onOpenChange={(open) => {
        if (!open) endIcon();
      }}
    >
      {item && <IconPicker key={item.id} id={item.id} onDone={endIcon} />}
    </Dialog>
  );
}

function IconPicker({ id, onDone }: { id: string; onDone: () => void }) {
  const { tree } = useCollectionData();
  const setIcon = useSetIcon();
  const item = tree.byId.get(id);
  const current = item?.icon ?? null;
  const [focused, setFocused] = useState(() => choices.indexOf(current));
  // The name under the grid: the icon under the pointer, else the focused one.
  const [pointed, setPointed] = useState<number | undefined>(undefined);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  if (!item) return null;
  const color = effectiveColor(item, tree.byId);
  const named = (index: number) => {
    const icon = choices[index];
    return icon === null || icon === undefined ? "None" : iconNames[icon];
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const next = movedTo(event.key, focused, choices.length);
    if (next === undefined) return;
    event.preventDefault();
    setFocused(next);
    buttons.current[next]?.focus();
  };
  return (
    <DialogContent className="max-w-xs" initialFocus={() => buttons.current[focused] ?? true}>
      <DialogHeader>
        <DialogTitle>Icon for {item.name}</DialogTitle>
      </DialogHeader>
      <fieldset className="m-0 grid min-w-0 grid-cols-6 justify-between gap-1 border-0 p-0">
        <legend className="sr-only">Icons</legend>
        {choices.map((icon, index) => (
          <button
            key={icon ?? "none"}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            type="button"
            aria-label={named(index)}
            aria-pressed={icon === current}
            tabIndex={index === focused ? 0 : -1}
            onFocus={() => setFocused(index)}
            onKeyDown={onKeyDown}
            onPointerEnter={() => setPointed(index)}
            onPointerLeave={() => setPointed(undefined)}
            onClick={() => {
              setIcon(item.id, icon);
              onDone();
            }}
            className={cn(
              "grid size-9 place-items-center rounded-md text-fg-secondary focus-ring-inset outline-none hover:bg-hover",
              icon === current && "bg-selected hover:bg-selected",
            )}
          >
            <ContainerIcon kind={item.kind} color={color} icon={icon} className="size-5" />
          </button>
        ))}
      </fieldset>
      <p aria-hidden data-slot="icon-name" className="text-small text-fg-secondary">
        {named(pointed ?? focused)}
      </p>
    </DialogContent>
  );
}
