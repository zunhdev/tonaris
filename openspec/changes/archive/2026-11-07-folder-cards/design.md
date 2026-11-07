# Design

## Context

- A view's presentation is `presentationOf(kind, prefs, defaults)`: prefs win, then the account defaults. Folders and the root ignored any stored layout and always showed rows; `setView` refused a layout for them. The defaults had one `layout`, for lists and Unsorted.
- Folder views are `ContainerRows`, a virtualized ARIA grid using `useGridFocus`. Album cards (`AlbumCards`) virtualize rows of cards over the same hook.
- The owner's whole collection is on the device (sync): every list's entries and albums, views, defaults and manual keys. A shared view has its snapshot; a guest page renders on the server, where the CSP refuses style attributes.

## Decisions

### 1. A default of its own, not the lists' default

`folderLayout` beside `layout` in the account defaults, so a person can keep lists in Rows and folders as cards (the creator's pick). It starts at Grid. The column's default `grid` gives existing saved defaults Grid too, as the creator decided folders open as cards for everyone. `defaultsFrom` saves a folder's layout as `folderLayout`.

### 2. Covers from the views' own order

`coversIn(container, { children, albums })` takes a list's first albums, or recurses through a folder's children until it has three. The owner's views pass each folder's and list's presentation (sort, grouping, manual keys), the same functions the views use; shared views pass the viewer's presentation over the snapshot; guest pages pass the visit's sort, and folders by name. Computed per card, memoized on the collection's data.

### 3. Cards on the album grid's machinery

`ContainerCards` sizes and virtualizes like `AlbumCards` (160 px minimum, 16 px gap, rows of cards) and walks with `useGridFocus`, its `cellProps` on each card's link, so Enter and a click open it; ⌥↑ and ⌥↓ rearrange under Manual through the same `moves` as rows. `CoverFan` places covers by classes only, so guest pages render it on the server.

### 4. Tests that are about rows

Browser tests of rows' own features (descriptions, Created, dragging, phone rows) now set the account's folder layout to Rows first (`foldersAsRows`), and new tests cover the cards.

## Risks / Trade-offs

- [Everyone's folders change at once] → the creator chose it; Rows is one choice away, per folder or as the default.
- [Sorting a long list for its card's covers] → only for cards in view, memoized; sorting thousands of albums takes milliseconds.
- [`defaults.set`'s request changed in place] → closed testing; oasdiff reads an added optional field as compatible. TON-164's spent ignore entries go, so they can't hide a real removal later.
