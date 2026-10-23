# Design

## Context

- **Albums today:**
  - rows and cards (TON-34);
  - inline title, artist and year edits in Editing mode, with the rules in `album-edit.ts` and the inline-editor registry (TON-37);
  - list entries, added and removed by `membership.add` and `membership.remove` (TON-27).
- **Nothing opens an album yet:**
  - `useGridFocus` takes an `onActivate` for Enter;
  - the sidebar's "Add album" is a disabled placeholder;
  - `Artwork` shows a tile, and takes a `src` for later.
- **The save-state layer's Edit** reopens the tree's name editor for failed container writes. Album writes have no Edit yet.
- **Decided with the creator on 23 October 2026:** the artwork URL is a placeholder until capture (M3), where the album record gains it with the image proxy (TS-103).

## Goals / Non-Goals

**Goals:**
- **An inspector** that shows everything an album has today, and edits it in Editing mode under FR-02.6 and CAS.
- **A manual entry form** that shows every field, requires exactly FR-02.6's information, and never loses what was typed.
- **Lists from the inspector:** in and out, with Undo.

**Non-Goals:**
- **Artwork URLs** and the image proxy (M3).
- **Service links** and the service chooser (M4).
- **Custom fields** (M4).
- **The capture popover and C** (M3). Until then, "Add album" opens the form itself.
- **"Delete from collection…"** (M5).
- **Selection, multi-album "Add to list…", and dragging albums onto lists.**
- **The inspector on mobile** (DS-110).

## Decisions

### 1. Where the inspector lives

- **The address.** The `/_workspace` route takes an optional `album` search parameter, a UUID, and drops anything else. `useInspector()` gives the open album's ID, `open(id, { replace })` and `close()`, which navigate with the parameter set or removed.
- **The pane.** The shell gives the inspector a third grid column, 380 px wide, when the window is at least 1100 px (`useWideScreen`). Below that it is a fixed panel over the view, at layer 50 with the floating shadow (DS-18, DS-30). It is an `aside` labelled "Album".
- **Opening:**
  - a click in an album's row or card, handled once on the grid, ignoring the drag handle and text fields. Opening narrows the view, so in Editing mode, with the inspector closed, a click waits 300 ms for a double-click, which edits the cell instead (DS-45);
  - Enter in Viewing mode, through `useGridFocus`'s `onActivate`. In Editing mode, Enter keeps editing the cell (TON-37).
- **Following.** While the inspector is open, focus moving to another album in the grid (J, K, the arrows) shows that album, replacing the history entry.
- **Closing:** Esc closes it while it is open, unless a field, dialog, popover or menu has the keys. So does its Close button.
- **A missing album** shows "This album isn't available." with Close.

### 2. The inspector's content

`AlbumDetails` renders the sections for an album, and serves both the pane and `/a/$albumId`:
- **Header:** the 240 px `Artwork` with alt "Cover of {title}", the title and artist, and `SaveStateMarker` for the album.
- **Chronology:**
  - the release type, Live, the original year, and the recording year or range, shown when Live;
  - **a hint:** "Sorts by its recording year.", "Sorts by its release year, as the recording year is unknown." or "Sorts by its original release year.".
- **Links and Custom fields:** headings with a short line saying they arrive with their features.
- **Lists:** chips linking to each list the album is in, with its folder path in the chip's accessible name, or an "Unsorted" chip.
- **Info:** "Added {date}", from the album's UUIDv7 ID (TS-10).

### 3. Editing in the inspector

- **Viewing mode** shows text. **Editing mode** shows editors:
  - **title, artist, original year and recording years:** fields that save on Enter or blur and discard on Escape, like the inline cells;
  - **release type:** a `SegmentedControl` (Album, EP, Compilation, Unknown);
  - **Live:** a `Switch`. The choice controls save on change.
- **The rules.** `album-edit.ts` gains the `originalYear` and `recording` fields, beside `year`, and `albumChoice(album, values)` for the release type and Live. Each checks the year format and `albumProblem()`.
  - **A refusal** shows under the field, or under the chronology for a choice, and nothing is sent.
  - **A choice that is refused** stays as saved: "Give the album a year." when Live goes off without an original year.
- **Saving** is `client.albums.update`: one `album.update` with `base` (TS-21), and the recording start and end together. So every list showing the album updates live, and conflicts go to the review.
- **The registry.** Open fields register their commit, so leaving Editing saves or stays (TON-37).
- **Offline,** the inspector shows values, not editors, with a line saying changes can wait (DS-81).

### 4. Lists in the inspector

- **Removing.** A chip's × (Editing mode) deletes the entry through `client.memberships`. An Undo toast, "Removed from {list}" (DS-50), puts it back. The entry comes back at the end of the list, as a new one (DS-51).
- **Adding.** "+ Add to list", or L, opens `AddToListDialog`: the owner's lists the album isn't in, with their folder paths. Choosing one inserts the entry and announces "Added {title} to {list}".
  - **What L acts on:** the inspector's album, else the focused album row. It is edit intent, so it switches to Editing first, and it waits while offline.

### 5. The manual entry form

- **Rules.** `album-form.ts` is pure and tested:
  - `formProblems(form)` maps fields to messages: title and artist required; years as digits or a range; the applicable year required (FR-02.6);
  - `albumOfForm(form)` builds the album with a new UUIDv7.
  - The domain's `albumProblem()` checks the result last.
- **The dialog,** `NewAlbumDialog`, is 560 px wide and titled "New album".
  - **Fields, in DS-47's order:** title*, artist*, the release type and Live, the original year, the recording year or range (when Live), and artwork, links and custom fields as placeholders. Then the destination: a select of "No list (goes to Unsorted)" and the owner's lists with their folder paths.
  - **Helper text:** "Required: original release year — or, for live releases, the recording year or release year."
  - **Validation** runs on blur (touched fields) and on submit. Errors appear under each field with `aria-invalid` and `aria-describedby`. On submit, an alert summary at the top lists them, and focus goes to the first.
  - **⌘Enter** submits.
  - **Esc, or closing,** with anything typed asks "Discard this album?": Discard or Keep editing.
- **Saving:**
  - inserts the album, then the entry if a list is chosen;
  - dismisses the failed write it replaces, if opened from Edit;
  - closes, and announces "Added {title}".
- **Where it opens:** `CollectionUi` holds the open form's draft (`startNewAlbum(draft)`), like "Move to…". It opens from:
  - the sidebar's "Add album", with the current list as destination;
  - "+ Add album" below a list's rows in Editing mode;
  - Edit on a failed `album.create`, pre-filled.

  Each switches to Editing first, and the sidebar button is disabled offline with "You're offline".

### 6. `/a/$albumId`

A workspace route renders `AlbumDetails` on its own page, titled with the album's name, with "Not available" for a missing album (DS-32). Links inside the app open the inspector over the current view instead.

### 7. Keys

- **Esc** is handled by the inspector while it is open (decision 1).
- **L** joins the shortcut matcher as `add-to-list`.
- **The reference** gains Enter ("Open"), L, and Esc.

## Risks / Trade-offs

- **[A native select for the destination]** → It is accessible and works with the keyboard as is. DS-47's combobox, with typing to filter, can replace it when there are more lists than a select suits.
- **[Undo re-adds at the end]** → A removed entry's place isn't kept (DS-51), so Undo puts the album back at the end, not where it was.
- **[No source in Info]** → The client doesn't carry provenance yet. The source arrives with capture (M3).

## Migration Plan

Client only. No data changes.

## Open Questions

None.
