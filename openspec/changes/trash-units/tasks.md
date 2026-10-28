# Tasks

## 1. Domain

- [x] 1.1 Add `trash.ts` with the unit record, `container.delete` and `trash.recover`, the mutations, the change, and the store's methods in `memoryStore` (design decisions 1 to 3). Verify with `trash.test.ts`:
  - a list and a folder deleted;
  - Unsorted placement;
  - a resend;
  - recovery to the parent, with `needs_input` for a trashed or missing parent and for a taken name;
  - an explicit destination and name.

  Add property tests: random trees and deletions keep units disjoint, separately deleted content keeps its unit and dates, and recovering a unit restores exactly its members.

## 2. Database

- [x] 2.1 Implement the store's methods, and active-only containers and memberships with units in the bootstrap (design decision 4). Verify with `trash.test.ts` against Postgres: deletion and recovery, the bootstrap, and Unsorted.

## 3. Web

- [x] 3.1 Add the trash units collection, deletion and recovery actions, descriptions, retries and dependencies, and regenerate the OpenAPI document (design decision 5). Verify with unit tests and `sync.test.ts`: a list deleted in one session leaving another, and recovered.
- [x] 3.2 Add ⌫, the header buttons, the undo toast and the folder confirmation (design decision 5). Verify with Playwright (`trash.e2e.ts`):
  - a list deleted by ⌫ and undone;
  - a folder deleted through the confirmation;
  - its album entering Unsorted.

## 4. Docs

- [x] 4.1 Update DS-50, DS-78, TS-13 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check` and the OpenAPI comparison with main.
