# Proposal

Linear: TON-127 (Design). Implements FR-06.5, FR-07.11. Design: DS-21, DS-22, DS-25, DS-70, DS-72. Done when guest and viewer pages show their albums' services as links, in rows and the grid.

## Why

In the creator's manual testing (31 October 2026), a shared link's page gave each album an "Open" button that opened an "Open in…" popover. The creator expected the links the signed-in album list shows: each service by name, as a link (TON-125).

## What Changes

- **Rows and cards on shared pages** show each linked service by name, underlined, with a ↗, in the link colour on hover, as the list's Services column and cards do.
- **On desktop, rows** have a Services column at the end. **On phones,** a row with links shows them on a third line, under the artist, so it grows to fit (the creator chose this on 31 October 2026). **Cards** show them on a line under the artist.
- **The links take focus,** unlike the workspace's, since shared pages have no `O` key and no grid focus to keep.
- **A guest's links** open the service's page in a new tab with no referrer (TS-32). A signed-in viewer's follow their link setting (TON-104).
- **The Open button and its popover leave shared pages.** The signed-in viewer's shared view (DS-70) draws the same content, so it changes too.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: a guest page's albums show their services as links instead of a chooser.

## Impact

- **`apps/web`:** `share-content.tsx`, `service-names.tsx`, `service-choices.tsx`, `e2e/guest.e2e.ts`, `e2e/shared-viewing.e2e.ts`.
- **Docs:** DS-70 and DS-72 as built.
