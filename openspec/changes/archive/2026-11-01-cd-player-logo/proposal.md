# Proposal

Linear: TON-154 (Design). Design: DS-19, DS-30. Done when tabs, the home-screen icons, the sidebar and the sign-in page show the new mark, and DS-19 records it as built.

## Why

TON-114's temporary mark, a record sliding out of its sleeve, looked sloppy in the creator's logo review (1 November 2026). Its card was tall rather than square, the disc slightly shorter than it, the hole a bite out of the disc's edge, and the mark sat off-centre in the icon and was clipped by 0.6 units in the app. Over three rounds of variants, the creator chose a disc on a compact CD player (variant 2b).

## What Changes

- **The mark** (the creator chose it, 1 November 2026): a square player body with the disc in front of it, overhanging its right side. A gap separates the disc from the body, and the disc's hole shows the player's spindle. Flat, in one color, 22.5 × 16 units.
- **The wordmark** sizes the mark by its height: 16 px beside `text.brand` in the sidebar and on guest pages, 22 px beside `text.page` above the sign-in card.
- **Favicon and icons:** `favicon.svg` and `icon-maskable.svg` get the same shapes, a little right of centre for balance, and the PNGs are rendered again.
- The mark is no longer called temporary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: the temporary-mark requirement becomes the logo's.

## Impact

- **`packages/ui`:** `components/logo.tsx`.
- **`apps/web`:** `public/favicon.svg`, `public/icon-maskable.svg` and the PNGs `scripts/render-icons.mjs` renders; the comment in `e2e/identity.e2e.ts`.
- **Docs:** DS-19 and the design decisions log (item 8).
