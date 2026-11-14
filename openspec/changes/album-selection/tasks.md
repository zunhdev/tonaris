## 1. Selecting

- [x] 1.1 A view's selection: toggled, extended from where the last range starts, cleared on Esc, on leaving Editing mode or the view.
- [x] 1.2 X, ⇧↑ and ⇧↓ in the album grid; checkboxes on rows and cards with ⇧-click; the selected look and `aria-multiselectable`.

## 2. Acting on it

- [x] 2.1 The selection bar: the count, Add to list…, Remove from the list, Delete… and Clear selection.
- [x] 2.2 ⌫, ⌘⌫ and L act on the selection when there is one; each action is one transaction, so one batch.
- [x] 2.3 Add to list… and the deletion confirmation for several albums; `trash.deleteAlbums`.

## 3. Words and tests

- [x] 3.1 DS-21, DS-45, DS-50 and DS-78 record it as built; the shortcut reference lists X, ⇧↑ and ⇧↓.
- [x] 3.2 A browser test: X, ⇧↓, Esc, checkboxes with ⇧-click, adding with Undo, removing with Undo, and deleting in one batch.
