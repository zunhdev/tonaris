# Proposal

Linear: TON-38 (Feature). Implements:
- FR-02.4, manual entry;
- FR-02.6, required information, in the interface;
- FR-03.1–FR-03.2, editing an album's metadata, with current values only;
- FR-01.6 and FR-01.8 from the inspector: putting an album in lists, and taking it out.

Design: DS-46 (the album inspector) and DS-47 (the manual entry form), with DS-30's inspector pane, DS-32's `/a/:albumId` and `?album=`, DS-45's read-only Viewing, DS-78's Enter, Esc and L, and DS-80's save states. Verifies AC-08 in the interface.

## Why

Albums can be seen in rows and cards, and their title, artist and year edited inline (TON-37). But nobody can open an album to see all it is, edit its chronology and classification, see or change the lists it is in, or add an album by hand. FR-02.4 needs a manual form, and FR-02.6 the same required information wherever an album is made or changed. Capture (M3), service links and custom fields (M4) build on the inspector and the form.

## What Changes

- **The album inspector** (DS-46):
  - **Opening:** a click on an album's row or card, or Enter in Viewing mode. It shows the album at `?album=:id`, so a reload or a shared link keeps it open.
  - **Closing:** Esc or its Close button.
  - **J and K** move the grid's focus, and the inspector follows to the focused album.
  - **The pane:** 380 px beside the view, overlaying it below 1100 px wide (DS-30).
- **Its sections:**
  1. **Header:** the artwork tile at 240 px, then the title and artist, with the album's save state.
  2. **Chronology:** the release type (Album, EP, Compilation, Unknown), a Live switch, the original release year, and the recording year or range (when Live). A hint says which year sorts (FR-05.5, FR-05.6).
  3. **Links:** a placeholder until service links (M4).
  4. **Custom fields:** a placeholder until custom fields (M4).
  5. **Lists:** a chip per list the album is in, linking to the list, or "Unsorted" with none.
  6. **Info:** when the album was added to the collection. Its source arrives with capture (M3).
- **Viewing mode** shows the values read-only (DS-45). **Editing mode** makes them editors:
  - title, artist and years save on Enter or leaving the field, as inline cells do;
  - the release type and Live save on change;
  - each list chip gets a × that removes the album from that list, with an Undo toast (DS-50);
  - "+ Add to list" (or L) opens a picker of the lists it isn't in.
- **Edit rules** (FR-02.6, TS-21):
  - every edit is one `album.update` from the values it replaces, so a stale one is a conflict for review;
  - required information and year formats are checked before sending, with the reason beside the field, and nothing is sent (X-05);
  - leaving Editing mode commits an open field, or stays with its error (TON-37);
  - offline, fields don't open for editing (DS-81).
- **The manual entry form** (DS-47, FR-02.4):
  - **The dialog:** "New album", 560 px wide.
  - **Fields:**
    - title and artist, required;
    - release type and Live;
    - the original release year, and the recording year or range when Live;
    - placeholders for artwork, links and custom fields: artwork until capture (M3, decided with the creator on 23 October 2026), links and fields until M4;
    - a destination list, defaulting to the current list or "No list (goes to Unsorted)".
  - **Helper text** gives the year rule.
  - **Validation** runs on blur and on submit. Errors show under each field and in a summary at the top for screen readers. Nothing incomplete is saved, and nothing is invented (AC-08).
  - **Keys:** ⌘Enter saves. Esc asks before discarding what was entered.
  - **Saving** creates the album, then its entry in the destination list.
  - **A failed save's Edit** reopens the form with what was entered.
- **Where the form opens:**
  - the sidebar's "Add album", enabled now;
  - "+ Add album" at the end of a list in Editing mode (DS-45).

  Capture (M3) will put its popover in front of the form, with "Enter manually". Opening the form is an edit, so it switches to Editing first, and it waits while offline.
- **`/a/:albumId`** shows the album on its own page, for links entered directly (DS-32).
- **Shortcuts:** Enter opens the inspector, Esc closes it, and L opens "Add to list…" for the album in the inspector or the focused album row.
- **Docs:** DS-30, DS-32, DS-46, DS-47 and DS-78 as built.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: the inspector shows an album and edits it under the album rules; the manual entry form; adding to and removing from lists in the inspector.
- `app-shell`:
  - "Collection views have their own routes" gains `?album=` and `/a/{albumId}`;
  - the shortcuts gain Esc and L.

## Impact

- **Web app:**
  - in `features/collection`: the inspector, its sections and editors, the manual entry form, the "Add to list" picker, the rules extended in `album-edit.ts`, and the grids opening the inspector;
  - in `features/shell`: the inspector pane in the shell, and Esc and L;
  - the `/_workspace` route's `album` search parameter, and the new `/a/$albumId` route;
  - the save-state layer's Edit for album creates;
  - a `Switch` in `packages/ui`.
- **No server or protocol change.** Everything uses `album.create`, `album.update`, `membership.add` and `membership.remove`.
- **E2E:** new accounts and `e2e/album-inspector.e2e.ts`.
