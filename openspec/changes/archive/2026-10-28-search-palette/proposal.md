# Proposal

Linear: TON-61 (Feature). Implements FR-12.1, FR-12.2, FR-12.4 and FR-12.5 for owned content, in the app. Design: DS-75. Tech: TS-50. Done when results update within 50 ms per keystroke at 5,000 albums and the owned-content part of AC-25 passes.

## Why

The sidebar's Search item is a disabled placeholder, and there is no way to jump to a folder, list or album by name. FR-12.2 promises one search, available everywhere in the signed-in app, over what the person owns.

## What Changes

- **The command palette** (DS-75): ⌘K (Ctrl+K on Windows and Linux) or the sidebar's Search item opens it from anywhere in the workspace, also while a text field has focus (DS-78).
- **Instant local search:** every keystroke matches the query, case- and accent-insensitively and as a substring, against the active owned collection's folder names, list names, album titles and artist credits, from the client's store (TS-50). Trash isn't searched; Unsorted is.
- **Grouped results:** Folders, Lists, Albums, up to 8 each with "Show all {n}" to expand in place.
  - Each result shows where it is: a container its parent path ("Metal › Doom", or "Collection"); an album the path of its first list (alphabetical by path) with "+N more", or "Unsorted" (decided with the creator, 28 October 2026).
  - Within a group, names that start with the query come first, then those with a word starting with it, then the rest, each tier alphabetical (decided with the creator, 28 October 2026). An album ranks by the better of its title and artist.
  - The matched part is highlighted in the original spelling, so "bjork" highlights "Björk".
  - Album results show 24px artwork, title, artist and year.
- **Opening:** Enter or a click opens a folder or list; an album opens in its first list (or Unsorted) with the inspector. ⌘Enter opens an album on its own page.
- **Narrow screens:** below 768px the palette fills the screen, as DS-75's mobile search sheet.
- **The shortcut reference** lists ⌘K.

Commands, recent items and the `>` filter come with TON-63; shared content with M7 (TON-72); server search with TON-62.

## Capabilities

### New Capabilities

- `search`: finding owned folders, lists and albums by name, title or artist, and opening them, from anywhere in the app.

### Modified Capabilities

None.

## Impact

- **`packages/domain`:** the ranking tier and the match range for highlighting, beside `searchKey` (TS-12), so the server search (TON-62) ranks and highlights alike.
- **`packages/ui`:** a command-palette dialog primitive (DS-20's palette row).
- **`apps/web`:** `features/search/` (the index and the palette), the shell's ⌘K and the sidebar's Search item, the shortcut reference.
- **No API or schema change.**
