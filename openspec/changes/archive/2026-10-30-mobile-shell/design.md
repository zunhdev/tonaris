# Design

## Context

- **Already there:** narrow screens were already always in Viewing mode (`CollectionUiProvider`), the mode switch hid itself, and Trash, sharing, export and "Open in…" had phone handling. The shell itself had none.
- **DS-110** sets the phone layout: drill-down navigation, 56 px rows, a read-only album sheet, view options in a bottom sheet, and desktop-only areas left out.

## Goals / Non-Goals

**Goals:** browsing the collection, Unsorted, Shared with me, an album and search on a phone, with the same routes and data as the desktop.

**Non-Goals:**
- editing, rearranging or sharing management on a phone;
- a native app;
- gestures such as swiping back. The browser's own Back still works.

## Decisions

### 1. The same routes, a different shell

Below 768 px the shell renders no sidebar, and `PageHeader` becomes the top bar. Each view passes `back`: a folder's or list's parent, Collection, or within a share its parent folder or Shared with me. Back goes there, rather than through history, so a link opened straight on a phone still has a way up.

### 2. The root screen's own links

The sidebar holds Unsorted and Shared with me on a wider screen. On a phone, the root screen pins them below its folders and lists, so they're in reach however long the collection is. Trash stays on the desktop (DS-110).

### 3. Rows fit the phone

Rows are 56 px for albums, with the artist under the title, and 48 px for folders and lists, meeting the 44 px touch target. The virtualizers size by the same height. The album grid drops the artist column: three columns, so the keyboard grid stays consistent.

### 4. Sheets from the existing parts

- **The album:** the inspector's `placement` becomes `beside`, `overlay` or `sheet`. The sheet is fixed to the bottom at 92% of the screen's height, and focuses Close when it opens.
- **View options:** on a phone, a bottom-sheet `Dialog` holds the same choices, as "Open in…" already did.

### 5. axe and Base UI's focus guards

In Safari, Base UI gives a dialog's invisible focus guards `role="button"`, for VoiceOver, and axe calls them unnamed buttons. The phone tests leave them out of axe. TON-93's VoiceOver walkthrough checks them.

## Risks / Trade-offs

- **The header changes for every view.** The desktop branch is unchanged, and the full desktop suite runs on it.
