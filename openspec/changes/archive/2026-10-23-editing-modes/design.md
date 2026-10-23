# Design

## Context

- **Editing UI so far:**
  - the tree's inline name editor, for creating and renaming (TON-33). Its state is in `editing.ts`, and every start goes through `useStartEditor()`;
  - M and dragging onto the tree, for moves (TON-36);
  - rows' drag handles, shown under Manual sort in any mode, as a stopgap until this issue (TON-36).
- **No album is editable in the interface yet.** The albums collection already turns an update into `album.update` with `base` (TS-21), and the domain's `albumProblem()` holds FR-02.6.
- **Grids** are virtualized ARIA grids with roving focus (`useGridFocus`). Their keys (`grid-keys.ts`), including J and K, would also act on keys typed into a field inside a cell.
- **Device state** lives in `features/shell/device.ts`, guarded against unavailable storage.
- **Decided with the creator on 23 October 2026:**
  - inline album cells are built here;
  - a drop that moves a folder or list switches to Editing.

## Goals / Non-Goals

**Goals:**
- **A clear, safe mode switch** that never loses an edit in progress and never touches permissions.
- **Editing affordances in Editing mode only,** started by edit intent from Viewing.
- **Inline title, artist and year edits** that follow the same rules as every other album write.

**Non-Goals:**
- **Selection checkboxes and "+ Add album"** (DS-45's other Editing affordances). They come with selection and capture (M3).
- **The inspector's editors** (TON-38).
- **Viewers' "View only" pill** (M7).
- **The mobile layout** (DS-110). Here the toggle is hidden below 768 px, and the mode reads as Viewing there.
- **Inline editing in cards.** A card is one cell; the inspector covers it.

## Decisions

### 1. Mode state

- **Where it lives.** `CollectionUi` gains `mode`, `setMode(next)`, which answers whether it switched, and `enterEditing()`. It is kept in localStorage as `tonaris:mode:<accountId>`, with Viewing when unset or unreadable.
- **Below 768 px** (a media query), the effective mode is Viewing and the toggle is hidden.
- **Announcements:** `enterEditing()` announces "Editing mode on" politely. E and the toggle announce "Editing mode on" or "Editing mode off".

### 2. Leaving Editing safely

- **The registry.** `CollectionUi` holds a registry of open inline editors, each with a `commit(): boolean`: true if it closed (saved, or nothing to save), false if its value is refused and it stays open.
  - The tree's name editor registers while open. Its commit is what leaving the field does: a blank name cancels, and anything else saves or is refused.
  - An album cell editor registers while open.
- **Leaving** (`setMode("view")`) commits every open editor first. If any refuses, the mode stays, and that editor focuses with its error.
- **A click on "View"** blurs the field first, so the editor has already saved or been refused when the click lands. The registry then sees the outcome.

### 3. Edit intent

`enterEditing()` is called:
- by `useStartEditor()`, which covers N, ⇧N, the "+" menu, F2 in the tree, Edit on a failed write and "New list" in empty views;
- by M, before opening "Move to…";
- by a drop onto the tree that moves something;
- by F2 on an album row.

Enter and double-click on cells act only in Editing mode. In Viewing mode they are left for the inspector (TON-38).

### 4. The toggle and the header

- **`ModeSwitch`** is a `SegmentedControl` labelled "Mode", with View and Edit, in the actions of the root's, folders', lists' and Unsorted's headers, before View options.
- **The tint.** `PageHeader` takes `editing`, which tints its bottom border `accent.solid`.
- **`E`** joins the shortcut matcher as `toggle-mode`, and the reference lists it.

### 5. Drag handles

Rows show the handle, and take part in dragging, when `manual && editing`. Keyboard rearranging stays in both modes, being presentation. Tree items stay draggable in both modes. A drop that moves calls `enterEditing()`.

### 6. Inline album cells

- **Rules.** `features/collection/album-edit.ts` is pure and tested. `albumEdit(album, field, text)` answers the album fields to save, or a refusal, or nothing for an unchanged value.
  - **Title and artist:** trimmed. Blank is refused: "Give the album a title." or "Give the album an artist."
  - **Year,** as the cell shows it:
    - **non-live:** `originalYear`. Blank is refused, as FR-02.6 requires it.
    - **live with a recording year:** "1978" or "1978–1982" (any dash) sets `recordingYearStart` and `recordingYearEnd` together. Blank clears both, which is allowed only if there is an original year to fall back to.
    - **live without one:** `originalYear`, the release year it shows.
  - **Format:** a year is 1 to 9999 written as digits. Otherwise: "Enter the year as four digits, such as 1986." A range ending before it starts is refused, as the domain refuses it.
  - **Last,** `albumProblem()` checks the result, so the client never sends what the domain would refuse.
- **Interaction,** in `album-rows.tsx`:
  - **The editing state** — `{ albumId, field, draft, refusal }` — lives in `AlbumRows`. The row being edited stays rendered while scrolling, because the virtualizer's `rangeExtractor` includes it.
  - **The cell** renders an input labelled "Title of '{title}'", "Artist of '{title}'" or "Year of '{title}'".
  - **Keys:** Enter saves and Escape discards. Leaving the field saves a valid value, or shows the refusal and stays open.
  - **Focus** returns to the cell when the editor closes.
- **Saving** goes through `client.albums.update`, so the album's save marker, CAS conflicts and Activity apply (DS-80). A range is one update of two fields, as TS-21 treats fields submitted together.
- **The grid's keys** are skipped while a text field inside the grid has focus (`isTextField`), so J, K and the arrows type and move the caret.
- **Offline:** Enter, F2 and double-click do nothing on a cell (DS-81).

## Risks / Trade-offs

- **[A blur that saves]** → Leaving a field saves it, like the tree's name editor. Escape is the way to discard. This is consistent across editors.
- **[Hidden toggle below 768 px with a stored Editing mode]** → The effective mode is Viewing there, so nothing editable shows. The stored mode returns on desktop.
- **[Range parsing]** → Only digits and one dash are accepted. Anything else is refused with the format message, rather than guessed.

## Migration Plan

Client only. The mode starts as Viewing for everyone. The drag handles, shown in any mode since TON-36, now need Editing.

## Open Questions

None.
