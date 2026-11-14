# Proposal

## Why

DS-49 promises "Move to position…" in the palette: in a view in manual order, a number moves the focused item to that position. It waited for the palette (TON-63) and was never built, so only dragging and ⌥↑/⌥↓ rearrange, one step at a time. The creator decided on 14 November 2026 to build it (TON-225, DRIFT-075). Linear: TON-230.

## What Changes

- ⌘K offers "Move to position…" for the focused album, folder or list row in a view in manual order. There is no album menu, so the palette is its one place.
- A dialog "Move '{name}' to position" says where it stands ("It's at 3 of 12.") and takes a whole number from 1 to the count. Grouped, the count is its group's, as ⌥↑ and ⌥↓ count.
- A number out of range says "Enter a whole number from 1 to {n}." under the field and moves nothing. The current position closes the dialog and moves nothing.
- The move is written as the view's order and announced "Moved {name} to position {n} of {total}", as other moves are. The focus stays on the item.
- Under another sort the command is unavailable with "Rearranging works in manual order"; with nothing focused in the view, "Focus an album, folder or list in the view first".
- It is presentation, as rearranging is: no Editing mode, and it works offline.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`: Move to position… rearranges by number.
