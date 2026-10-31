# Proposal

Linear: TON-134 (Design). Implements FR-07.13 and section 2.2's mobile browsing. Design: DS-67, DS-110. Done when a phone's Collection screen switches between the person's own folders and lists and those shared with them.

## Why

In the creator's manual testing (31 October 2026), shared folders and lists on a phone sat behind "Shared with me", pinned at the bottom of the Collection screen under Unsorted, where they were easy to miss. The creator wanted them on the main part of the screen, with a switch between the person's own and the shared.

## What Changes

- **A "Mine | Shared" switch** under a phone's top bar on the Collection screen (the creator chose this over a bottom tab bar or one list with sections, 31 October 2026). "Shared" carries the count of what's shared.
- **Mine** shows the person's folders and lists, with Unsorted pinned below, as before.
- **Shared** shows pending invitations first, as one row to the inbox, then each shared folder or list by name with its owner, those that can't be opened dimmed. Each opens its shared view, whose Back returns to Shared. Shared has no View options.
- **The side is kept** in the address (`/c?show=shared`) and remembered on the device.
- **The bottom's "Shared with me" link goes**, since the switch replaces it. Desktop doesn't change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-web`: the root screen switches between Mine and Shared.

## Impact

- **`packages/ui`:** `SegmentedControl` gains a `touch` size, 44 px.
- **`apps/web`:** `views.tsx` (the switch), `phone-shared.tsx`, `shared-view.tsx` (Back), `device.ts`, `routes/_workspace/c.tsx`, `e2e/mobile.e2e.ts`.
- **Docs:** DS-110 as built.
