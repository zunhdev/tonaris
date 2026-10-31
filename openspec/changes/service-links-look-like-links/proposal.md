# Proposal

Linear: TON-123 (Design). Implements FR-06.2. Design: DS-46, DS-19. Done when the album panel's service links are restyled.

## Why

In the creator's manual testing (31 October 2026), a streaming service's link in the album panel didn't read clearly as a link. It was primary-coloured text, underlined only on hover, with a small boxed-arrow icon in the same colour.

## What Changes

- **The link takes Tonaris's link style:** accent text, as the app's other text links, underlined faintly at rest and fully on hover.
- **A ↗ after it** says it opens outside Tonaris, in the service's app or its page in a new tab (FR-06.6).
- No service logos (DS-19, DS-25).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-links`: the album panel's links read as links.

## Impact

- **`apps/web`:** `album-links.tsx`.
- **Docs:** DS-46 as built.
