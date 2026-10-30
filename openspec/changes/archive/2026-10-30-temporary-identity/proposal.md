# Proposal

Linear: TON-114 (Design). Design: DS-13, DS-19, DS-30. Done when tabs show the mark, the sidebar and sign-in show the mark and the name, and DS-19 records the temporary identity.

## Why

In the creator's manual testing (30 October 2026), Tonaris had no logo or favicon: browser tabs showed a blank icon, and the name in the sidebar was plain 15 px text. The creator will design a permanent logo later, and asked for a temporary one in the spirit of Linear's in the meantime, with the name a little more prominent.

## What Changes

- **A temporary mark:** a record sliding out of its sleeve, flat and in one color, as `packages/ui`'s `Logo`, with `Wordmark` (the mark beside the name).
- **The wordmark** in the sidebar and on guest pages (`text.brand`, 17 px semibold, a new type size) and above the sign-in card (`text.page`).
- **Favicon and icons:** `favicon.svg`, the light mark on the accent; PNGs at 32, 180 (iOS), 192 and 512 px, and a maskable 512 px, rendered by `apps/web/scripts/render-icons.mjs`. The root document links the favicon and iOS's icon.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: a temporary mark identifies Tonaris.

## Impact

- **`packages/ui`:** `components/logo.tsx`, the `text.brand` token.
- **`apps/web`:** `public/` icons, `scripts/render-icons.mjs`, the root document's links, the sidebar, guest pages and sign-in frame.
- **Docs:** DS-13, DS-19.
