# Proposal

## Why

Since TON-231, every album row and card in Editing mode shows a selection checkbox, a card's on a dark tile over the cover's corner. In manual testing on 14 November 2026, the creator didn't want it on every album. Linear: TON-232.

## What Changes

- With nothing selected, an album's checkbox shows only while the pointer is over the album or it has the focus. Rows keep the box's room, so nothing shifts.
- Once any album is selected, every album shows its checkbox, so what's selected stays visible.
- The box is lighter: on a card, a white ring over the cover, without a tile, filled with the accent and a check once selected; on a row, a small square in `border.strong`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: checkboxes show on hover or focus until albums are selected.
