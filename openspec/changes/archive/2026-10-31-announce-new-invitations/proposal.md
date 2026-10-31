# Proposal

Linear: TON-129 (Feature). Implements FR-07.5. Design: DS-31, DS-66, DS-108. Done when a new invitation brings a toast in the recipient's open app, once.

## Why

In the creator's manual testing (31 October 2026), the invitation email arrived, but the open app gave no sign: only the sidebar's Invitations appeared, which is easy to miss.

## What Changes

- **A new pending invitation is announced** in the open app: "{owner} shared "{name}" with you", with View opening it; several found together read "{n} new invitations", with View opening the inbox (the creator chose a toast that can be up to a minute late, 31 October 2026).
- **It's noticed as the sidebar's Invitations is:** on load, on focus and every minute.
- **Each is announced once per device,** those found on load included, and not on the Invitations pages.
- **A new toast kind, notice,** stays 8 s with one action.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: pending invitations are announced in the recipient's open app.

## Impact

- **`packages/ui`:** `toast.tsx` (notice) and its test.
- **`apps/web`:** `pending-invitations.ts` keeps the list, `invitation-toasts.tsx`, `device.ts` (announced invitations), `shell.tsx`, `e2e/invitations.e2e.ts`.
- **Docs:** DS-66 and DS-108 as built.
