# Proposal

## Why

DS-49 promises that, in a list, albums can be dragged onto another list in the sidebar, which adds them to it and keeps them where they are, and that holding ⌥ moves them instead. Dragging moves only folders and lists today; an album's handle only rearranges it in manual order. The creator decided on 14 November 2026 to build it (TON-225, DRIFT-075). Linear: TON-229.

## What Changes

- In Editing mode on a computer, an album row's drag handle shows in the person's own lists and Unsorted whatever the sort. Under Manual it still rearranges too.
- Dropping an album on a list in the sidebar adds it there, announced "Added {title} to {list}", as Add to list does. It stays in the list on view.
- Holding ⌥ while dropping, from a list, moves it: out of the list on view, into the other. A toast "Moved to {list}" offers Undo.
- While dragging, a list that would take the album is highlighted, and the overlay says "Add to {list}" or "Move to {list}". A list the album is already in, a folder, and every list while offline take nothing.
- Albums in a share the person edits can't be dropped on their own lists, which are another collection.
- L, "Add to list…", stays the keyboard's way.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: albums dragged onto a sidebar list are added to it, or moved with ⌥.
