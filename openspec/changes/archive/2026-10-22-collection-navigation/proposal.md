# Proposal

Linear: TON-33 (Feature). Implements FR-01.3 (rename and navigate; you can always tell where you are) and the interface side of FR-01.1 (creating folders and lists). Design: DS-27, DS-30–DS-32, DS-78, with DS-105's empty states. Wires in the save-state pieces TON-31 left for the tree (DS-80–DS-83).

## Why

The workspace has a sidebar of placeholders and one route, `/c`. A person can't see their folders and lists, open one, or tell where they are, and they can't create or rename anything without the test hook. FR-01.3 requires that users can always tell where they are and navigate the hierarchy. Every later M2 view (rows, sorting, manual order, modes, the inspector) hangs off this shell and its routes.

## What Changes

These follow the creator's decisions of 22 October 2026: the tree creates and renames, while moves stay with TON-36; views get their real header and a placeholder body until TON-34's rows.

- **The sidebar tree** (DS-27, DS-31), following the ARIA tree pattern.
  - It holds the folders and lists, nested, in creation order, which is DS-44's fallback until TON-36 adds manual order.
  - Below them are Unsorted, with its album count, then Shared with me and Trash as placeholders.
  - Lists show their album count. The current view's item is selected, and its ancestors are expanded.
  - Expansion is kept per device.
  - Rows carry their save-state marker, `aria-busy` and the live-update highlight (TON-31).
- **Keyboard navigation** (DS-27): ↑/↓, Home/End, ←/→ to collapse, expand or move to the parent, Enter to open, and type-ahead by name.
- **Creating and renaming** (FR-01.1, FR-01.3).
  - **New list** (N) and **New folder** (⇧N) go into the focused folder, or the current view's, or the root. A "+" menu next to Collection does the same.
  - **F2** renames the focused folder or list.
  - Both edit inline in the tree. A blank name, a name that is too long, or one already used among its siblings keeps the editor open with the reason (DS-107), and nothing is sent.
  - Offline, both are disabled ("You're offline", DS-81).
  - A failed create or rename offers **Edit** in its toast, in Activity and in batch reports. Edit reopens the editor with the attempted name (DS-80).
- **Routes** (DS-32):
  - `/c`, `/f/$folderId`, `/l/$listId`, `/unsorted`, `/trash` and `/shared`;
  - a folder link that names a list leads to the list, and the other way round;
  - a missing folder or list says it isn't available;
  - `/` opens the last collection view visited on this device, or `/c`.
- **Breadcrumbs** (DS-29, DS-30): each view's header shows its path from Collection, with the view's name as the page's heading and title.
- **Views:** a one-line summary ("2 folders and lists", "12 albums") or the DS-105 empty state, until TON-34's rows replace the body.
- **Shortcuts** (DS-78):
  - G then H, U, T or S goes to the root, Unsorted, Trash or Settings;
  - `[` hides or shows the sidebar;
  - `?` opens the shortcut reference, also reachable from the account menu.

  Shortcuts are off while a text field has focus.
- **The sidebar** (DS-30) can be resized between 200 and 360 px, by pointer or keyboard, and hidden. Both are kept per device.
- **Docs:** DS-27, DS-30–DS-32, DS-78 and DS-105 record what is built, and TS-03 the client-only `/`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`:
  - adds the sidebar tree and its keyboard navigation, the collection routes, breadcrumbs, the shortcuts, and resizing and hiding the sidebar;
  - changes "Three-pane desktop shell" (a resizable, hideable sidebar) and "The root path opens the collection" (the last view visited).
- `collection-hierarchy`: adds creating and renaming folders and lists in the interface.

## Impact

- **Web app:**
  - `features/collection`: the tree's model, the tree, the inline editor, the views and breadcrumbs, the editing store;
  - `features/shell`: the shell's layout, the shortcuts and the shortcut reference;
  - `routes/_workspace`: the new routes, with `/` moving under the workspace;
  - `features/sync`: Edit in toasts, Activity and reports.
- **UI package:** a `Dialog` on Base UI, for the shortcut reference.
- **E2E:** new accounts and `e2e/collection-navigation.e2e.ts`; `app-shell.e2e.ts` gets the root's DS-105 empty state.
- **Domain:**
  - exports the name refusals, so the client checks names with the same words;
  - `uuidv7()` counts up within a millisecond, so IDs made together sort in creation order.
- **API:** no change.
