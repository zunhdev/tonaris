# Proposal

Linear: TON-181 (Feature). Implements FR-02.2 (a capture's destination) and FR-02.4 (manual entry) through DS-47's and DS-48's List field, with "Add to a list"'s finding (TON-177, FR-12.5). Done when both dialogs' List field finds lists by typing.

## Why

From the creator's manual testing (8 November 2026): the List field in "Add albums" was the browser's own select, listing every list at once. With hundreds or thousands of lists it filled the screen and took a long scroll. The manual entry form, "New album", has the same field. "Add to a list" had the same problem, solved in TON-177.

## What Changes

- **The List field** (decided with the creator: a button with a popover, not a text field) looks as before and shows the chosen list's path, or "No list (goes to Unsorted)". A click, or ↓, Enter or Space, opens a popover.
- **The popover** has "Find a list" with the focus, as "Add to a list" does. Before typing: "No list (goes to Unsorted)" first, then 8 lists, recent ones first. Typing finds lists by the words of their path, 50 at most. ↑ and ↓ move, Enter or a click chooses and closes it, and the chosen option has a check. Esc closes only the popover.
- **Both dialogs:** "Add albums" and "New album".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: a destination list is found by typing.

## Impact

- **`apps/web`:** "Add to a list"'s combobox moves into a shared `features/collection/list-finder.tsx`, used by `add-to-list.tsx` and a new `list-field.tsx`, which replaces the select in `capture-dialog.tsx` and `new-album.tsx`. Tests: `capture.e2e.ts`, `album-inspector.e2e.ts`.
- **Docs:** DS-47 and DS-48 as built.
- No API, data or sync change.
