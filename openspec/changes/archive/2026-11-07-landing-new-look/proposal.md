# Proposal

Linear: TON-176 (Design). Brings DS-120's pictures up to date. Done when each picture matches the app as it looks after TON-175, on desktop and on a phone.

## Why

The landing page draws its pictures of the app from the app's own tokens and parts (TON-155). TON-167 to TON-175 changed how the app looks, and the creator asked to update the pictures to match (7 November 2026). The tint already followed the tokens, but the shapes and parts did not.

## What Changes

- **The workspace picture:** the list as a grid of covers, raised, with release labels and the open album's ring and title. The sidebar has colored folders and lists, guide lines and the round avatar. The panel has the cover's wash, Links, Custom fields, tinted list chips and Properties.
- **Folders within folders:** a colored tree with guide lines, a folder's cards with fanned covers, and tinted chips.
- **Steps and features:** a filled, focused field, a frosted Open in… popover, a filled share-link field, and frosted search.
- **Every cover:** the edge.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `landing-page`: the pictures keep up with the app's look.

## Impact

- **`apps/web`:** `features/landing/pictures.tsx` and `albums.ts` (Blue Hour Sessions' links; the grouping helper is gone).
- **Docs:** DS-120.
