# Proposal

Linear: TON-125 (Design). Implements FR-06.5. Design: DS-21, DS-22, DS-25. Done when rows and cards show their services as links.

## Why

In the creator's manual testing (31 October 2026), the creator asked for streaming links to read more clearly as links. They meant the album list and its cards. TON-123 restyled the album panel's links instead, and that stays. In the list, the Services column showed "Spotify, Tidal" in `fg.tertiary`, underlined only on hover, so the names read as plain values.

## What Changes

- **Each service name in a row or card** is `fg.secondary`, with a faint underline that is always there and a small ↗ after it, as the panel's links have.
- **On hover** it takes the link colour, `accent.solid`, and a solid underline.
- **Names are spaced apart** instead of separated by ", " or " · ".
- Their names, focus behaviour and destinations don't change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-links`: the list's and cards' service names read as links.

## Impact

- **`apps/web`:** `service-names.tsx`, `album-rows.tsx`, `album-cards.tsx`, `e2e/open-in.e2e.ts`.
- **Docs:** DS-21 and DS-22 as built.
