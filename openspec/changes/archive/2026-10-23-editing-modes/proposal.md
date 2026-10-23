# Proposal

Linear: TON-37 (Feature). Implements FR-04.1–FR-04.2, viewing and editing modes, and part of FR-03.1: an album's title, artist and year edited inline in its row, under FR-02.6's required information. Design: DS-45, with DS-21's inline cells, DS-49's drag handles in Editing mode, DS-78's E and F2, and DS-81's offline edit controls.

## Why

The views show editing affordances all the time: drag handles under Manual sort (as a stopgap since TON-36), and the tree's naming. FR-04 asks for a clean Viewing mode to browse in, and an Editing mode for changes. The mode must always be clear, must never grant write access, and leaving it must not lose an edit in progress. DS-45 also gives Editing mode its inline album cells, which nothing provides yet. The creator decided on 23 October 2026 to build them here.

## What Changes

- **Two modes** (FR-04.1, DS-45):
  - **Viewing** is the default: a clean list or grid, with no drag handles or inline editing.
  - **Editing** shows drag handles (under Manual sort) and makes album cells editable inline.
  - **The mode is app-wide,** kept on the device per account, and not synced.
- **The toggle:** a `View | Edit` segmented control in every collection view's header, and `E`.
  - Editing mode also tints the header's bottom border with `accent.solid`, so the mode is always visible (FR-04.2).
  - **The toggle is hidden below 768 px,** where the app is for browsing (FR-04.1, X-04). The mobile layout itself is DS-110's issue.
- **Edit intent switches to Editing first,** and "Editing mode on" is announced politely:
  - N, ⇧N and the "+" menu;
  - F2, and Edit on a failed write;
  - M;
  - a drop that moves a folder or list onto the tree (decided with the creator on 23 October 2026);
  - F2 on an album row, which edits its title.
- **Inline album cells** (DS-45, FR-03.1, FR-02.6), in Editing mode, in rows:
  - **Starting:** Enter or a double-click on the title, artist or year cell, or F2 for the title.
  - **Saving:** Enter or leaving the field saves; Escape discards.
  - **What the year edits** is what the cell shows: the original year; a live album's recording year or range ("1978–1982"); or, for a live album without one, the release year it falls back to.
  - **Refusals:** a value FR-02.6 or the year's format refuses keeps the editor open with the reason, and nothing is sent (X-05).
  - **CAS:** each edit is one `album.update` from the value it replaced (TS-21), so a stale edit is a conflict for review.
  - **Offline,** cells don't open for editing (DS-81).
- **Leaving Editing mode safely** (FR-04.2), with an inline editor open (a cell, or the tree's name editor):
  - a valid value is saved, and the mode switches;
  - an invalid value keeps the editor open with its error, focused, and the mode stays until the value is fixed or discarded.
- **A mode never grants write access.** It is interface state only: nothing is sent when it changes, and the server judges every write the same in either mode.
- **Unchanged in both modes:**
  - keyboard rearranging (⌥↑/⌥↓), which is presentation (DS-49);
  - View options;
  - opening folders and lists.
- **Docs:** DS-21, DS-45, DS-49 and DS-78 as built.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`:
  - **Added:** the two modes, the toggle, edit intent, and leaving safely (FR-04).
  - **Changed:** "People rearrange views in manual order" now shows drag handles in Editing mode only.
- `album-records`: owners edit an album's title, artist and year inline (FR-03.1, FR-02.6).
- `app-shell`: "Keyboard shortcuts move around the workspace" gains `E`.

## Impact

- **Web app** (`features/collection`, `features/shell`):
  - the mode state and its device key;
  - the inline-edit registry that leaving Editing mode commits;
  - the toggle and the header tint;
  - edit intent in `useStartEditor`, `M` and tree drops;
  - the drag handles gated to Editing;
  - inline album cells, with the pure rules in `album-edit.ts`;
  - grid keys that leave text fields alone;
  - E in the shortcuts and their reference.
- **No server or protocol change.** Inline edits use the existing `album.update`.
- **E2E:** new accounts and `e2e/editing-modes.e2e.ts`. TON-36's drag test switches to Editing first.
