# Proposal

Linear: TON-162 (Design). Changes FR-14.1's album deletion trigger in the inspector (DS-46, DS-50). Done when "Delete from collection…" is a trash icon in the album panel's header, beside Close, in Editing mode, and the footer button is gone.

## Why

In the creator's manual testing (4 November 2026): "Delete from collection…" sat at the very bottom of the album panel, below Info, out of view on a laptop until scrolled to the end.

## What Changes

- **A trash icon button in the panel's header, beside Close** (the creator chose this on 4 November 2026), named "Delete from collection…", with a tooltip of that name and ⌘⌫.
- **In Editing mode only,** as the footer button was, and not while offline (DS-81). Phones are read-only, so their sheet has none.
- **It opens the same confirmation;** ⌘⌫ keeps working.
- **The footer button goes.**

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trash-and-recovery`: the inspector's delete is in its header, always in view.

## Impact

- **`apps/web`:** `inspector.tsx` (the header's button), `album-details.tsx` (the footer button removed); the browser test in `album-trash.e2e.ts`.
- **Docs:** DS-46 and DS-50 as built.
