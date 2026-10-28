# Proposal

Linear: TON-63 (Design). Implements FR-12.2's palette commands and Q-02's keyboard access. Design: DS-75, DS-78. Done when every shortcut can be found both in the palette and in the reference sheet.

## Why

TON-61's palette finds content only. DS-75 makes it the one place for content and commands, with recent items when empty. DS-78 wants every shortcut listed in the palette too. The `?` reference also misses shortcuts that exist: R in Trash, and ⌘Enter.

## What Changes

- **Commands in the palette** (DS-75):
  - Every action shortcut is a command, showing its keys. Pure navigation keys (arrows, J/K, Home/End, Enter, Esc, ⌥↑/⌥↓) stay in the reference only (decided with the creator, 29 October 2026). The commands:
    - Go to Collection, Unsorted, Trash and Settings; Hide or Show sidebar;
    - Switch to editing or viewing; View options;
    - Add albums from links, Add to list…, Open in…, Delete album from collection…;
    - New list, New folder, Rename, Move to…, Delete;
    - Restore, in Trash; Keyboard shortcuts.
  - Typed text matches commands by name, and they appear below content results. A leading `>` lists only commands.
  - A command acts on what had the focus when the palette opened, or on the inspector's album, as its key would.
  - One that can't run is shown dimmed with the reason: "You're offline", or what to open or focus first.
- **An empty palette** shows:
  - **Recent:** the last 8 folders, lists and albums opened anywhere, newest first, kept on this device. Ones deleted or in Trash drop out.
  - **Frequent commands:** the 5 commands run most from the palette on this device, topped up with a starter set: Add albums from links, New list, Go to Unsorted, Switch mode, Keyboard shortcuts.
  - Both decided with the creator, 29 October 2026.
- **The `?` reference** lists every shortcut. It's built from the same command list as the palette, plus the navigation keys, so the two can't drift. It gains R (Restore, in Trash) and ⌘Enter (submit a form; open an album on its own from search).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `search`: the palette gains commands, recent items and frequent commands, and shortcut parity with the reference.

## Impact

- **`apps/web`:**
  - `features/shell/shortcuts.ts`: the command list, and the reference built from it;
  - `use-shortcuts.ts`: one command runner shared by keys and the palette;
  - the palette;
  - `device.ts`: recent items and command use;
  - the workspace route, which records what was opened.
- **No API or schema change.**
