# Proposal

Linear: TON-136 (Design). Design: DS-13, DS-110. Done when phones use type one step larger, with desktop unchanged.

## Why

In the creator's manual testing (31 October 2026), text on phones was too small to read comfortably: phones used the desktop's sizes, with rows and menus at 13 px. The creator asked for one step larger, without overdoing it, and chose a 15 px base.

## What Changes

- **Below 768 px**, the type tokens are redefined: micro 12/16, small 13/18, base 15/22, title 17/24, brand 19/26, page 22/30, display 30/36 (size / line height, px).
- Inputs stay 16 px on phones, as before. Desktop keeps every size.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: typography gives phones a larger base.

## Impact

- **`packages/ui`:** `tokens.css`.
- **Docs:** DS-13 as built.
