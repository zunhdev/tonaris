# Proposal

Linear: TON-117 (Design). Implements FR-01.3, FR-01.4, FR-01.11. Design: DS-27, DS-45, DS-50. Done when a folder or list can be renamed, moved, shared and deleted from its sidebar menu with the mouse, and renamed from the header.

## Why

In the creator's manual testing (30 October 2026), renaming a folder or list was keyboard-only (F2, or ⌘K → Rename), and deleting was only in the view's header in Editing mode. The creator asked for edit and delete buttons, and chose a ⋯ menu on each sidebar row plus Rename in the header.

## What Changes

- **A ⋯ on each sidebar folder and list,** on hover, opening Rename (F2), Move to… (M), Share… (⇧S) and Delete… (⌫), each running its shortcut's command on that row.
- **Shift+F10 or the Menu key** opens the same menu from the keyboard.
- **Rename in the view's header,** in Editing mode, beside Delete.
- **The shell shares its command runner,** so menus and buttons run the same commands as the shortcuts and ⌘K.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: folders and lists have a menu in the sidebar, and the header renames.

## Impact

- **`packages/ui`:** `DropdownMenuContent` takes `anchor`.
- **`apps/web`:** `container-menu.tsx`, the tree's rows and keys, the shell context (`runCommand`, `commandBlocked`), the view header, the shortcut reference, `e2e/container-menu.e2e.ts`.
- **Docs:** DS-27 as built.
