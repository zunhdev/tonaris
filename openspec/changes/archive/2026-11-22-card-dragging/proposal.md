# Proposal

Linear: TON-322 (Feature). Extends FR-05.2's rearranging by pointer, DS-49 and DS-45, to cards. Done when, in Editing mode under Manual sort, an album card or a folder or list card dragged onto another card lands beside it, and the order is the same after a reload.

## Why

From the creator's manual testing (22 November 2026): in a list shown as a grid, in Editing mode and Manual sort, the albums can only be rearranged with ⌥↑ and ⌥↓. Dragging needs a switch to Rows, whose drag handle does it. Folders open as Grid and Manual by default (TON-174), so their cards have the same gap.

## What Changes

- **Cards drag.** In Editing mode on a computer, under Manual sort, an album card in a list or Unsorted, and a folder or list card in a folder or the root, drag from anywhere on the card: cards have no handle. A press that moves less than 6 px is still a click, so a card still opens.
- **Where it lands:** a 2 px `accent.solid` line in the gap left or right of the card under the pointer, as tall as the cover. The gap around a card counts as the card while dragging, so a drop between two cards lands there.
- **The dragged card** fades to 40%, as a dragged row does, and the name chip follows the pointer, just right of it.
- **A card does what its row's handle does** (decided by the creator, 22 November 2026): an album card in the person's own list or Unsorted drags onto their lists in the sidebar in any sort in Editing mode (TON-229), and a folder or list card onto a folder in the sidebar, or Collection, to move it.
- **Unchanged:** Viewing mode and phones drag nothing; ⌥↑ / ⌥↓ and "Move to position…" stay the keyboard's ways; grouped, a card moves among its group's.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`: rearranging by pointer covers cards.
- `collection-hierarchy`: albums reach a sidebar list from their card too.

## Impact

- **`apps/web`:** `features/collection/drag.tsx` (drop targets across a row of cards, the card's drop zone and line, the chip at the pointer), `album-cards.tsx`, `container-cards.tsx`, `album-rows.tsx` (who may drag onto lists, shared with cards); `e2e/manual-order.e2e.ts` and its accounts.
- **Help:** `organize/move-and-rearrange.mdx` ("With the mouse"), `organize/lists-in-and-out.mdx` (covers have no handle, use L), `organize/viewing-and-editing.mdx` (handles on rows). No pictures change: none shows a card being dragged.
- **Help index:** `pages.gen.ts` and `search.gen.json`, regenerated.
- **Docs:** DS-22, DS-41, DS-45 and DS-49. The PRD is unchanged: FR-05.2 promises rearranging on desktop, not how.
