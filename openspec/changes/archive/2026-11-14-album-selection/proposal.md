# Proposal

## Why

DS-21, DS-45, DS-50 and DS-78 promise selection: X to select the focused album, ⇧↑ and ⇧↓ to extend it, checkboxes in Editing mode, and acting on the selection together. None of it exists, so taking twenty albums out of a list means twenty removals. The creator decided on 14 November 2026 to build it (TON-225, DRIFT-075). Linear: TON-231.

## What Changes

- In Editing mode on a computer, album rows and cards in lists and Unsorted have a checkbox. X selects or deselects the focused album, switching to Editing mode first. ⇧↑ and ⇧↓ add the album above or below; ⇧-click on a checkbox adds the albums from the last one chosen. Esc clears the selection, and so does leaving Editing mode or the view.
- Selected rows and cards show `bg.selected`, and the grid is multi-selectable for assistive technology.
- A bar under the albums shows "{n} albums selected", with Add to list…, Remove from {list} (in a list), Delete… and Clear selection.
- ⌫ in a list, ⌘⌫ and L act on all the selected albums when there are some:
  - Add to list… offers the lists not all of them are in, adds the others in one batch, and offers Undo.
  - Removing takes them out of the list in one batch, with Undo.
  - Delete… confirms "Delete {n} albums from your collection?", naming the first three, then moves each to Trash as its own unit, in one batch. In a share the person edits, they leave the share only.
- After removing or deleting, the selection is cleared.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: selected albums are added to a list, removed from one and deleted together.
