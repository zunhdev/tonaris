# Proposal

Linear: TON-178 (Design). Adjusts FR-05's folder and list cards (DS-41), as built in TON-174. Done when a card's covers behind sit half as far apart as before, part of each still shows, and the fan still fills the card, in the app, on guest pages and on the landing page.

## Why

In manual testing on 7 November 2026, the creator found a folder's cards "too heavy for eyes". On a folder like Metal, every card fans three covers, each 12% of the card up and to the right of the one in front, which makes a busy wall of images. The creator asked to halve the space between the stacked covers and keep part of each cover behind visible.

## What Changes

- **Each cover behind sits 6% of the card up and to the right** of the one in front, down from 12%. The covers behind keep their 75% and 50% brightness.
- **The covers grow from 76% to 88% of the card**, so the fan still fills its square: the front cover at the bottom left, in line with the name below it, and the back cover's top-right corner at the card's corner, where the save state shows.
- One or two covers are centred the same way, and an empty folder or list still shows its icon.
- Guest pages and shared folders use the same fan. The landing page's folder picture follows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`: a card's fanned covers sit closer together and fill the card.

## Impact

- **`apps/web`:** `features/collection/cover-fan.tsx` (the places and the covers' width), `features/landing/pictures.tsx` (the landing picture's copy of them), and a browser test in `e2e/collection-views.e2e.ts` measuring the covers.
- **Docs:** DS-41 as built.
- No API, data or sync change.
