# Proposal

## Why

TON-280 gave album cards two-line titles, but folder and list cards still cut a name to one line, and the sharing glyph after it takes room too: in the creator's K-Pop folder every "Generation (…)" name ended in "…". Variant 8 had been among the creator's picks on TON-280's mock. Linear: TON-283.

## What Changes

- A folder's or list's name takes up to two lines beside its icon; a name still cut shows whole in a tooltip (DS-41).
- The count goes under the name at the bottom of the card, with the sharing glyph after it.
- A row of cards is a line taller only when one of its names takes two lines, as album cards' rows are.
- Guest pages' folder cards give names two lines too (DS-72).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`: folder and list cards give a long name a second line.
