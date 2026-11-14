# Proposal

## Why

DS-45, DS-50 and DS-78 promise that ⌫ on a focused album removes it from the list on view, with Undo. Today ⌫ only deletes a focused folder or list, and taking an album out of a list needs the × on its list chip in the inspector. The creator decided on 14 November 2026 to build it (TON-225, DRIFT-072). Linear: TON-228.

## What Changes

- In a list, ⌫ on a focused album takes it out of that list, in Editing mode (switching to it, as other edits do). The album stays in the collection, in its other lists or in Unsorted.
- A toast says "Removed from {list}" with Undo, and the change is announced, as the inspector's × does. Both use one removal.
- ⌫ on a focused folder or list deletes it, as before. Elsewhere, such as Unsorted, ⌫ on an album does nothing; ⌘⌫ still deletes an album from the collection.
- The shortcut reference and the palette name both: "Delete a folder or list, or remove an album from the list".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: ⌫ removes the focused album from the list on view.
