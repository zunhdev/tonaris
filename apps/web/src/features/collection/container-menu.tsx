// A folder's or list's menu in the sidebar (TON-117, DS-27): Rename, Move to…, Share… and Delete…, each the command
// its shortcut runs (F2, M, ⇧S, ⌫) on that folder or list. It opens from the row's ⋯ with the pointer, and with
// Shift+F10 or the Menu key from the keyboard. Offline, the commands wait, and the menu says why (DS-81).

import { useShell } from "@/features/shell/shell-context";
import type { CommandId } from "@/features/shell/shortcuts";
import { Fragment, useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@tonaris/ui/components/dropdown-menu";

/** The folder or list the menu is for, and the row it opens by. */
export type ContainerMenuTarget = { id: string; name: string; row: HTMLElement };

const items: { id: CommandId; label: string; keys: string; destructive?: boolean }[] = [
  { id: "rename", label: "Rename", keys: "F2" },
  { id: "move", label: "Move to…", keys: "M" },
  { id: "share", label: "Share…", keys: "⇧S" },
  { id: "delete", label: "Delete…", keys: "⌫", destructive: true },
];

export function ContainerMenu({
  target,
  onClose,
}: {
  target: ContainerMenuTarget | undefined;
  onClose: () => void;
}) {
  const { runCommand, commandBlocked } = useShell();
  // A chosen command places the focus itself, such as in the name's editor; otherwise it goes back to the row.
  const chosen = useRef(false);
  const on = target === undefined ? {} : { container: target.id };
  const blocked = target === undefined ? undefined : commandBlocked("rename", on);
  return (
    <DropdownMenu
      open={target !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuContent
        anchor={target?.row}
        align="end"
        className="w-48"
        aria-label={target === undefined ? undefined : `Actions for ${target.name}`}
        finalFocus={() => {
          const toRow = !chosen.current;
          chosen.current = false;
          return toRow ? (target?.row ?? true) : false;
        }}
      >
        {blocked !== undefined && (
          <p className="px-2 py-1 text-small text-fg-tertiary">{blocked}</p>
        )}
        {items.map(({ id, label, keys, destructive }) => (
          <Fragment key={id}>
            {destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={destructive ? "destructive" : "default"}
              disabled={commandBlocked(id, on) !== undefined}
              onClick={() => {
                if (!target) return;
                chosen.current = true;
                runCommand(id, on);
              }}
            >
              {label}
              <DropdownMenuShortcut>{keys}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
