# Proposal

Linear: TON-119 (Design). Design: DS-30, DS-31, DS-13. Done when a click on the sidebar's logo or name opens Collection.

## Why

In the creator's manual testing (31 October 2026), clicking the Tonaris logo and name at the top of the sidebar did nothing. In most apps it goes home, and Tonaris's home is the collection's root.

## What Changes

- **The sidebar's logo and name are one link to Collection** (`/c`), named "Tonaris, go to Collection", with the sidebar rows' hover and focus ring.
- The sign-in page's and guest pages' wordmarks stay plain: there is no collection to go to.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: the sidebar's wordmark goes to Collection.

## Impact

- **`apps/web`:** `sidebar.tsx`, `e2e/app-shell.e2e.ts`.
- **Docs:** DS-31 as built.
