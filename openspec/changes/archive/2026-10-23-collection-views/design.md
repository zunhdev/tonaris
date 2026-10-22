# Design

## Context

- **The views today** (TON-33). `features/collection/views.tsx` gives every collection view its header and a placeholder body: a summary, or the DS-105 empty state.
- **The collection** is read through `useCollectionData()` (`data.tsx`), built once per workspace from the sync client's TanStack DB collections with `useLiveQuery`. It holds the tree, list counts and the Unsorted count.
- **Albums** carry only their metadata (`packages/domain/src/albums.ts`): title, artist credit, release type, live, original year and recording years. Artwork and service links arrive with M3 and M4.
- **TanStack Virtual 3.14** is already a dependency. The TON-21 perf page used it for 36 px rows.
- **TON-31's pieces for rows:** `SaveStateMarker`, `useSaveState(id)` and `useLiveHighlight(id, ref)`. The highlight toggles a class without re-rendering.
- **DS-115 asks for collections as `grid`,** with `aria-rowcount` and `aria-rowindex` under virtualization.

## Goals / Non-Goals

**Goals:**
- **Both layouts at 5,000 albums:** smooth to scroll, with only what is in view rendered.
- **The grid pattern:** each view is fully usable by keyboard and screen reader.
- **Rows ready for later issues:** columns and cells that TON-35, TON-36, TON-37, TON-38 and M4 add to without restructuring.

**Non-Goals:**
- **Sort modes, directions, grouping and View options** (TON-35). The album order here is DS-44's first-time default only.
- **Manual order, drag handles and moves** (TON-36).
- **Editing mode's checkboxes and inline editing** (TON-37).
- **Opening an album:** the inspector and `?album=` (TON-38). Enter on an album does nothing yet.
- **The services column, the Open button and the service chooser** (M4).
- **Folder and list descriptions** (M4) and **sharing glyphs** (M7).
- **Real artwork:** the tile shows for every album until capture (M3) brings artwork.
- **Mobile layouts** (DS-110).

## Decisions

### 1. What the views read

`CollectionData` gains:
- `albumsById`;
- `entriesByList`: each list's entries;
- `unsortedAlbums`: the albums in no list.

They are built in the provider's `useMemo`, so the tree and all views share one pass over the collections.

A view then turns these into its rows:
- a list maps its entries to albums;
- Unsorted takes `unsortedAlbums`;
- a folder takes its children from the tree.

Optimistic writes and changes from elsewhere flow through as they already do.

### 2. Album order and year until TON-35

`features/collection/order.ts` is pure and tested in Bun.

- **`sortYear(album)`** applies FR-05.5:
  - a live album with a recording year sorts by `recordingYearStart`;
  - every other album sorts by `originalYear`, which also covers FR-05.6's fallback for a live album without one;
  - an unknown year sorts last.
- **`chronological(albums)`** sorts by `sortYear`, then by title with the domain's `searchKey`, then by ID, so the order is total and stable.
- **`yearLabel(album)`** shows `1986`, a live range as `1978–1982`, and "—" for unknown. DS-24's `rec.` prefix and fallback marker are TON-35's.

### 3. The artwork tile

`features/collection/artwork.tsx` renders a fixed square at a given size.

**With `src`:** an `<img loading="lazy" decoding="async" alt="">` fades in over 150 ms once loaded (DS-17), over the tile. On error it is removed, and the tile stays.

**Without `src`,** which is every album until M3, the tile is the image:
- **The hue** is a 32-bit FNV-1a hash of the title, modulo 360.
- **The colors** are low-chroma OKLCH: a background around L 0.33, C 0.04, and the letter around L 0.86 on the same hue. That keeps the tile calm, with the letter well above 4.5:1.
- **The letter** is the title's first grapheme (`Intl.Segmenter`), upper-cased.
- **For assistive technology** the tile is `aria-hidden`, since the title is beside it (DS-23).

*Alternative:* a hue palette in the tokens. A computed OKLCH hue gives every title its own tile with no table, and stays within DS-12's calm chroma.

### 4. Virtualization

Each view's body is the scroll container (`overflow-y: auto`), and `useVirtualizer` from TanStack Virtual reads it.
- **Rows:** a fixed 36 px, with an overscan of 10 (DS-106).
- **Cards:**
  - a `ResizeObserver` measures the body's width;
  - columns are `max(1, floor((width + gap) / (160 + gap)))`, so cards stay at least 160 px;
  - a card's width is what fills the row, about 200 px or less from 360 px of width up (DS-22);
  - each virtual row holds one row of cards, and its height is the card's width plus its text, re-measured when the width changes;
  - the overscan is 3 rows.

Rendered rows are absolutely positioned inside a block as tall as the whole list, as TanStack Virtual's examples do.

### 5. The grid pattern

Both layouts, and folder rows, are `role="grid"` with a hidden header row. It is a `row` of `columnheader` cells, so screen readers announce columns: Title, Artist, Year, Type, Status for albums, and Name, Contents for folders and lists.
- **Rows:** `aria-rowcount` is every row plus the header, and each rendered row carries its `aria-rowindex`.
- **Cards:** the grid carries `aria-colcount`, each card is a `gridcell` with its `aria-colindex`, and its name is the album's title, artist and year.

**Focus is on cells,** with a roving tabindex: one cell in the grid has `tabIndex=0`.

`useGridKeys(...)` (`features/collection/grid-keys.ts`) maps keys to the next cell. It is pure and tested in Bun.

| Keys | Moves to |
| --- | --- |
| ← → | the previous or next cell in the row; no wrapping, as the APG grid recommends |
| ↑ ↓, K J | the cell above or below, in the same column, clamped to the row's last cell |
| Home / End | the row's first or last cell |
| ⌘Home / ⌘End (Ctrl on others) | the first or last cell of the grid |
| Page Up / Page Down | the cell a page of rows away: the rows in view |

**Moving to a row that isn't rendered** calls `scrollToIndex`, then focuses the cell once it renders. A pending key is kept for the next render.

**Enter:**
- on a folder or list row, it opens it (the row's first cell is its link);
- on an album, it does nothing until the inspector (TON-38).

**Clicking a cell** makes it the focused one.

**J and K** are keys of the grid, not global shortcuts. In the tree they stay type-ahead letters, as decided in TON-33.

### 6. Columns

**Album rows** are a CSS grid template: artwork and title, artist, year, type, status.
- **Narrowing.** The view's body is an inline-size container. Below 640 px the Type column collapses first (DS-21; the services column, M4, will collapse before it). The header row hides that column too.
- **Status.** The status cell holds the `SaveStateMarker`. The row is `aria-busy` while pending or unconfirmed, and carries `useLiveHighlight`.

**Cards** carry the marker as a corner badge on the artwork (DS-22).

### 7. The layout switch

DS-40: lists and Unsorted only.
- **Control:** a Rows | Grid control in the header, two buttons with `aria-pressed`, labelled "Layout".
- **Kept per view on the device** (decided 22 October 2026), in `device.ts`'s `viewLayouts`, keyed by account, then by the list's ID or `unsorted`. TON-35 moves it into View options and syncs it (FR-11.8).
- **The header** gains an `actions` slot for it.

### 8. Measuring the 5,000-album scroll

The browser test seeds 5,000 albums through the page's client (25 batches of 200). It checks what is deterministic:
- `aria-rowcount`;
- a few dozen rows rendered;
- ⌘End reaching the last album;
- the same in Grid.

With `MEASURE_SCROLL=1`, it also scrolls the list for three seconds in each layout. It records frame intervals with `requestAnimationFrame` and prints the frame-time percentiles and the frames over 50 ms, after an idle baseline.
- **Run once, headed** (`--headed`), and the PR reports the numbers. That is proportionate (TS-120); timing assertions in the suite would flake.
- **Why headed.** Headless Chromium paces animation frames irregularly even when idle: about 105 frames in 3 s, half of them at 33 ms. That would measure the harness, not the views.

### 9. Focus rings that show

DS-115's ring is a 2 px solid `focus` outline on `:focus-visible`. The classes everywhere were `outline-none focus-visible:outline-2 focus-visible:outline-focus`.
- **In Tailwind v4,** `outline-none` sets `--tw-outline-style: none`, and `outline-2` reads that variable. So the ring had a width and a color but no style, and never showed.
- **The fix:** `focus-visible:outline-solid` beside every `focus-visible:outline-2`, in `packages/ui` and the app.
- **The guards:**
  - `design-system.e2e.ts` checks a keyboard-focused button's computed `outline-style`;
  - the views' test checks a focused card's.

*Alternative:* `outline-hidden` instead of `outline-none`. In v4 it also sets the style to `none`, outside forced-colors mode.

## Risks / Trade-offs

- **Recomputing the view's rows on every change** (5,000 albums, about 10,000 entries) costs a few milliseconds per change. → It is one `useMemo` per view; Q-01's targets are far above that. Indexes in TanStack DB live queries can come later without changing the views.
- **Focus can sit in a row that unmounts** when the person scrolls with the mouse. → The roving cell is kept by index, not element. Tab returns to it, and a key press brings it back into view first.
- **The layout is kept on the device only, until TON-35.** → It is one key to migrate into the synced preference.

## Migration Plan

No data changes. Nothing is remembered yet, so every view starts in Rows.
