# Proposal

Linear: TON-130 (Feature). Implements FR-07.6, FR-07.11, FR-07.13. Design: DS-31, DS-67, DS-70. Done when shared folders and lists appear and open in the sidebar's tree, live.

## Why

In the creator's manual testing (31 October 2026), Shared with me was a single place in the sidebar: shared folders and lists showed only on its page. The creator wants them in the tree, the way their own folders and lists are.

## What Changes

- **Shared with me opens in the tree,** starting open, to each folder or list shared with the person, directly under it with the owner's display name after it (the creator chose this, 31 October 2026). There are no owner rows.
- **A shared folder opens** to its folders and lists, in the person's own sort, and follows its owner's saves while open.
- **A click opens the shared view,** which the tree marks; opening a shared view opens what's above it. The keyboard works as in the rest of the tree.
- **`GET /v1/shared`** gives each available entry's folders and lists, an additive field, so the tree comes from one read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: Shared with me's folders and lists show in the sidebar's tree.

## Impact

- **`packages/domain`:** `sharedEntrySchema` gains `containers`.
- **`packages/db`:** `sharedWithMe` reads each available entry's folders and lists.
- **`apps/api`:** the OpenAPI document; `shared.test.ts`.
- **`apps/web`:** `tree.ts`, `collection-tree.tsx`, `shared-entries.tsx` (one read for the workspace), `shared-with-me.tsx`, `use-share-stream.ts` (one stream per share per tab), `e2e/shared-tree.e2e.ts`.
- **Docs:** DS-31, DS-67 and TS-24 as built.
