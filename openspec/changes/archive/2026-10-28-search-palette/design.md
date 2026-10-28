# Design

## Context

- **The client holds the active owned collection** in TanStack DB collections, read through `useCollectionData()`: the tree of folders and lists, the albums, and each list's entries. Trashed content isn't on the client (TON-55, TON-57), so a local search can't reach Trash.
- **`searchKey()`** (TS-12) is the one normalization for search, with parity fixtures in `packages/domain/fixtures/normalize.json`.
- **Opening an album in the inspector** is the `album` search parameter on any workspace route (DS-32); `/a/{id}` is its own page.
- **Shortcuts** are one capture-phase keydown listener (`use-shortcuts.ts`) over a pure matcher (`shortcuts.ts`), which ignores text fields and keys inside dialogs and menus.
- **Dialogs** are Base UI's, wrapped in `packages/ui`.

## Goals / Non-Goals

**Goals:** DS-75's palette for owned content, the 50 ms keystroke target at 5,000 albums, keyboard and screen-reader use (Q-02), and a ranking and highlighting the server search (TON-62) can share.

**Non-Goals:**
- commands, recent items and the `>` filter (TON-63);
- Shared with me results (M7, TON-72);
- the mobile shell's top-bar search icon (DS-110): there is no mobile shell yet, so narrow screens get the full-screen palette from the sidebar and ⌘K.

## Decisions

### 1. Ranking and highlighting live in `packages/domain`

- **`searchTier(queryKey, key)`:** 0 when the key starts with the query, 1 when a word in it does (the query follows a character that is neither a letter nor a digit), 2 for any other substring, `undefined` for no match.
- **`matchRange(query, text)`:** the `[start, end)` range of `text`, in UTF-16 units, that the query's match covers.
  - It builds `searchKey` code point by code point, recording each key unit's source range, and checks the result equals `searchKey(text)`; on any difference it gives no range rather than a wrong one.
  - The range extends over combining marks after its end, so a decomposed "ö" is highlighted whole.
- **Why the domain:** TON-62's server search ranks and highlights the same way, and the parity fixtures run against both.
- **Alternative:** ranking only in the web app. Rejected: the server would drift.

### 2. The index is a pure function over the collection data

- **`buildSearchIndex(data)`** in `features/search/search-index.ts` makes one entry per folder, list and album with its search keys. Album keys are cached in a `WeakMap` by row object, so a rebuild after an edit recomputes only changed albums.
- **`search(index, query)`** returns three groups with their totals, each sorted by tier, then key, then ID. An album's tier is the better of its title's and artist's; ties go by title, then artist.
- **Locations** are computed only for the results shown:
  - a container's: its ancestors' names joined with " › ", or "Collection";
  - an album's: the alphabetically first path among its lists, plus the number of other lists, or "Unsorted".
- **The palette builds the index while it is open**, so a closed palette costs nothing.
- **Alternative:** a search worker or a trigram index. Rejected: a substring scan of about 7,000 keys takes a few milliseconds.

### 3. The palette is a combobox over a virtualized listbox

- **`CommandDialog` in `packages/ui`:** Base UI's dialog, anchored near the top, 640px wide, without the close button, and full screen below 768px (DS-75's mobile sheet).
- **The field** is `role="combobox"`, with `aria-controls` and `aria-activedescendant`. ↑ and ↓ move the active option, wrapping; Enter opens it; ⌘Enter opens an album on its own page; Esc closes.
- **The listbox** has a `group` per heading and an `option` per result, "Show all {n}" included. Its rows are virtualized with `@tanstack/react-virtual`, so an expanded group of thousands stays fast. The active option is scrolled into view, so it's always rendered.
- **A polite status** announces the result count.
- **Why not cmdk,** which DS-20 names:
  - it filters and orders itself;
  - it doesn't virtualize, so "Show all" could render thousands of rows;
  - it would bring Radix into a Base UI system.
- **Opening** closes the palette, then navigates:
  - a folder to `/f/{id}`, a list to `/l/{id}`;
  - an album to its first list or `/unsorted` with `?album={id}`, or with ⌘Enter to `/a/{id}`.

### 4. ⌘K

- **The matcher** returns `search` for ⌘K or Ctrl+K before its text-field check (DS-78).
- **The shell** opens the palette. While the palette is open, its own field handles ⌘K and closes it, since the global listener ignores keys inside dialogs.
- **The sidebar's Search item** is enabled, with `aria-keyshortcuts`.

## Risks / Trade-offs

- **[`matchRange` differs from `searchKey` on some exotic text]** → it returns no range, so the result still shows, unhighlighted. Tests compare both on the fixtures and a sample of scripts.
- **[Rebuilding the index on every collection change while open]** → the album key cache keeps a rebuild cheap. A bun test measures build and query at 5,000 albums.

## Migration Plan

None: client-only, with no API or schema change.
