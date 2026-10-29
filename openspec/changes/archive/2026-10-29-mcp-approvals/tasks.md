# Tasks

## 1. Domain

- [x] 1.1 Add `approvalScopeSchema`, the scope builders, the summaries and consequences, and `deletionImpact()` (design decisions 1 and 5). Verify with unit tests: each operation's words, and who loses access.

## 2. Storage

- [x] 2.1 Add `approvals.batch_id` and its migration, `useApproval()` and `pendingApprovals()`, and prune approvals (design decisions 2 and 3).
- [x] 2.2 Add `deletionTargets()`, `savedAlbumOfReleaseGroup()`, and the field scopes in a transaction. Let `executeMutation` and `executeBatch` take a transaction. Remove `trashAlbums`.

## 3. Tools

- [x] 3.1 Add `writeApproved()`, the generic round trip, and the gated tools, and drop `delete_albums` and `add_albums`' match choice (design decisions 4, 6 and 7). Verify with contract tests (`approvals.test.ts`):
  - the round trip: asking, waiting, once, replay by key, a grown scope, a wider scope;
  - declining and expiry;
  - another connection and another operation;
  - the owner only, and the pending list;
  - revoking;
  - a folder with its Unsorted and sharing effects, deleted as one unit;
  - a field;
  - options, unused at once and chosen with a grown scope;
  - a match confirmed into a list.
- [x] 3.2 Add `GET /v1/approvals`.

## 4. Web

- [x] 4.1 Show each scope on the approval page, and add the pending store, Settings' waiting list and the sidebar's Approvals (design decision 8). Verify with Playwright (`approvals.e2e.ts`): the waiting list and sidebar count, an album approved on a phone, and a list's deletion declined, with axe.

## 5. Docs

- [x] 5.1 Record TS-63, TS-64, TS-91, DS-31, DS-86 and DS-87 as built. Verify the text matches the implementation.

## 6. Checks

- [x] 6.1 Run `bun run check`, a native `bun run build`, and CI's oasdiff on the pushed branch before archiving.

## Workflow follow-up

- Archive the change as the PR's last commit.
