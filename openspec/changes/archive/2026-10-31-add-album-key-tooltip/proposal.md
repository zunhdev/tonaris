# Proposal

Linear: TON-122 (Design). Design: DS-20, DS-48, DS-78. Done when each Add album button's tooltip shows C.

## Why

In the creator's manual testing (31 October 2026), nothing on the Add album buttons said that C does the same.

## What Changes

- **Each Add album button that opens the capture dialog** has a tooltip, "Add album" with **C** after it: the sidebar's, an empty list's, and the one under a list in Editing mode. Each carries `aria-keyshortcuts="C"`.
- **`TooltipShortcut`** in `packages/ui` shows a key after a tooltip's words, dimmer, as `DropdownMenuShortcut` does in menus. Hide sidebar and Show sidebar use it for `[`.
- Offline, the buttons keep "You're offline".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `link-capture`: Add album buttons show their key.

## Impact

- **`packages/ui`:** `tooltip.tsx` (`TooltipShortcut`).
- **`apps/web`:** `sidebar.tsx`, `views.tsx`, `page-header.tsx`, `e2e/capture.e2e.ts`.
- **Docs:** DS-48 as built.
