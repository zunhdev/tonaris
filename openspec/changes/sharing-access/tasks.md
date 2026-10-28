# Tasks

## 1. Domain

- [x] 1.1 Add `sharing.ts`: the statuses (moved from the db schema), `ShareViewer` and `viewerOf`, `createShareToken` and `shareTokenHash`, `readableContainers`, and `sharedSnapshotSchema` (design decisions 1, 2, 4 and 5). Verify with bun tests: tokens are 43 base64url characters and hash consistently, and the model's sources, statuses, Trash cuts and descendants.
- [x] 1.2 Property tests on the model with the in-memory store's real commands. Verify:
  - a move into or out of a shared folder gives or removes exactly its audience, and direct shares stay;
  - trashing and recovering with no revocation in between restores exactly the readable set;
  - a revocation made meanwhile stays in effect.

## 2. Database

- [x] 2.1 Add `findShareLink`, `readableContainers`, `canReadContainer` and `sharedSnapshot` in `packages/db/src/sharing.ts`, exporting `sync.ts`'s helpers (design decisions 3 to 5). Verify with db tests:
  - a property test of both queries against the model on random states;
  - a found link and a revoked one;
  - the snapshot's subtree, albums, links, descriptions, used fields and options, the hidden parent, the display name, and Trash exclusion;
  - AC-20 and AC-30 scenarios through real commands.

## 3. Docs

- [x] 3.1 Record TS-31 to TS-33 as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check`, and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
