# Proposal

Linear: TON-116 (Design). Design: DS-90. Done when the sign-in page shows what Tonaris is at desktop and phone widths, passes axe, and DS-90 records it.

## Why

In the creator's manual testing (30 October 2026), the sign-in page was a bare card, so a visitor learned nothing about Tonaris. The creator asked for a simple promo that explains the service and stresses what sets it apart: the MCP server, nested folders, sharing lists, and data export.

## What Changes

- **A promo beside the sign-in card,** on both sign-in steps: a headline, one sentence on capture, four features (MCP agents, nested folders and lists, sharing, export), and "invitation-only for now".
- **Layout:** promo left and card right from 768 px; on a phone, the card first and the promo below.
- **Other pages** that share the sign-in frame keep the plain card.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: the sign-in page says what Tonaris is.

## Impact

- **`apps/web`:** `features/account/promo.tsx`, `SignInCard`'s `promo`, the `/sign-in` route, `e2e/promo.e2e.ts`.
- **Docs:** DS-90 as built.
