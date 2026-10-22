# Proposal

Linear: TON-34 (Feature). Implements FR-05's presentation of collection contents: albums as rows or cards in lists and Unsorted, and folders and lists as rows in folders and the root. Design: DS-21–DS-23, DS-40, DS-41, with DS-106's virtualization and DS-115's grid semantics. Wires in TON-31's save-state pieces for rows and cards (DS-80, DS-82, DS-83).

## Why

TON-33 gave every view its route and header, but each body is still a one-line summary: nobody can see the albums in a list, or the folders and lists in a folder. FR-05 asks for the collection's contents in personal presentations. DS-40 builds both layouts from the start, and they must stay smooth at 5,000 albums (Q-01, DS-106). Sorting, grouping and manual order (TON-35, TON-36), modes (TON-37) and the inspector (TON-38) all act on these rows.

## What Changes

These follow the creator's decision of 22 October 2026: Rows and Grid are switched in the header, and the choice is kept per view on the device until TON-35's View options sync it.

- **Album rows** (DS-21) in lists and Unsorted, 36 px high:
  - a 28 px artwork tile;
  - the title, the artist and the year;
  - the release type in words, which collapses first as the view narrows;
  - the save-state slot.

  The checkbox and drag handle come with editing mode (TON-37) and manual order (TON-36). The services and the Open button come with service links (M4).
- **Album cards** (DS-22) in Grid: a square artwork tile, from 160 to 200 px in responsive columns, over the title, artist and year, with the save state as a corner badge.
- **Artwork** (DS-23):
  - **The fallback tile:** the title's first letter on a calm hue taken from the title. It shows whenever there is no artwork, while it loads, and if it fails, never as an error.
  - **Images** fade in over 150 ms, with lazy loading. Albums carry no artwork yet (capture, M3), so every album shows its tile for now.
- **Folder and root rows** (DS-41): the folder or list icon, the name, and the count (albums for a list, folders and lists for a folder). Enter or a click opens it. Descriptions and sharing glyphs come with M4 and M7.
- **Rows and Grid** (DS-40): lists and Unsorted switch with a Rows | Grid control in the header, kept per view on the device. Folders and the root always use rows.
- **Order until TON-35:**
  - **Albums** follow DS-44's first-time default, chronological ascending by FR-05.5's rule: the recording year for live albums with one, otherwise the original year. Unknown years come last.
  - **Folders and lists** keep creation order, as in the tree.
  - The year shows plainly. DS-24's `rec.` prefix and fallback marker come with TON-35.
- **Virtualized** (DS-106, Q-01): only the rows in view, plus a margin, are rendered. A 5,000-album list scrolls smoothly in both layouts.
- **Grids for assistive technology and the keyboard** (DS-115, DS-78).
  - Both layouts are ARIA grids, carrying `aria-rowcount` and `aria-rowindex`, and the cards also `aria-colcount` and `aria-colindex`.
  - Focus moves cell by cell with the arrows, J and K, Home and End, ⌘Home and ⌘End, and Page Up and Page Down.
  - Enter opens a folder or list.
- **Save states:** each album row and card, and each folder or list row, carries its save-state marker, `aria-busy` while saving, and the live-update highlight (TON-31's notes).
- **Focus rings show again** (DS-115).
  - **Found while building these grids:** no focus ring has shown anywhere since TON-7. Tailwind v4's `outline-none` sets the outline style to `none`, and `focus-visible:outline-2` inherits it.
  - **The fix:** every ring now adds `focus-visible:outline-solid`, guarded by a browser test.
- **Docs:** DS-21–DS-23, DS-40, DS-41, DS-78 and DS-115 record what is built and fixed.

## Capabilities

### New Capabilities

- `views-and-ordering`: how folders, lists and Unsorted present their contents, as rows or a grid, and later in which order (sorting, grouping and manual order, TON-35 and TON-36).

### Modified Capabilities

- `app-shell`: "Every view shows where it is" no longer summarizes a view's contents; the view shows them.

## Impact

- **Web app** (`features/collection`):
  - the views' bodies;
  - album rows and cards;
  - folder and list rows;
  - the artwork tile;
  - the keyboard grid;
  - the layout switch;
  - the album order.
- **Data:** `CollectionData` gains the albums by ID and each list's entries.
- **E2E:** new accounts and `e2e/collection-views.e2e.ts`, including a 5,000-album list in both layouts. A one-off measurement of scrolling it is reported in the PR.
- **API and domain:** no change.
