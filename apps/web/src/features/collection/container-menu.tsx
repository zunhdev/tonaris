// A folder's or list's menu in the sidebar (TON-117, DS-27): New list and New folder, made inside a folder and beside
// a list, as N and ⇧N make them from its row (TON-120); then Rename, Move to…, Share… and Delete…, each the command
// its shortcut runs (F2, M, ⇧S, ⌫) on that folder or list. Each shows its keys from the shortcuts' list (DS-78). It
// opens from the row's ⋯ with the pointer, and with Shift+F10 or the Menu key from the keyboard. Offline, the
// commands wait, and the menu says why (DS-81).

import { useShell } from "@/features/shell/shell-context";
import { shortcutLabel, type CommandId } from "@/features/shell/shortcuts";
import { Fragment, useRef } from "react";

import type { ContainerKind } from "@tonaris/domain";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@tonaris/ui/components/dropdown-menu";

import { useStartEditor } from "./collection-ui";
import { useCollectionData } from "./data";
import { placeFor } from "./editing";

/** The folder or list the menu is for, and the row it opens by. */
export type ContainerMenuTarget = { id: string; name: string; row: HTMLElement };

const creates: { id: CommandId; kind: ContainerKind; label: string }[] = [
  { id: "new-list", kind: "list", label: "New list" },
  { id: "new-folder", kind: "folder", label: "New folder" },
];

const items: { id: CommandId; label: string; destructive?: boolean }[] = [
  { id: "rename", label: "Rename" },
  { id: "move", label: "Move to…" },
  { id: "share", label: "Share…" },
  { id: "delete", label: "Delete…", destructive: true },
];

export function ContainerMenu({
  target,
  onClose,
}: {
  target: ContainerMenuTarget | undefined;
  onClose: () => void;
}) {
  const { runCommand, commandBlocked } = useShell();
  const startEditor = useStartEditor();
  const { tree } = useCollectionData();
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
        {creates.map(({ id, kind, label }) => (
          <DropdownMenuItem
            key={id}
            disabled={commandBlocked(id, on) !== undefined}
            onClick={() => {
              const container = target && tree.byId.get(target.id);
              if (!container) return;
              chosen.current = true;
              // Inside a folder, beside a list: where N puts it from this row.
              startEditor({
                mode: "create",
                kind,
                parentId: placeFor(container, undefined),
                name: "",
              });
            }}
          >
            {label}
            <DropdownMenuShortcut>{shortcutLabel(id)}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {items.map(({ id, label, destructive }) => (
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
              <DropdownMenuShortcut>{shortcutLabel(id)}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
