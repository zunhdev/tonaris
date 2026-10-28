# Tasks

## 1. Domain and database

- [x] 1.1 Add the skip report, tombstones on units, the unit's `parentId`, and renaming before recovering (design decisions 1, 2 and 4). Verify with `trash.test.ts`: an album in Trash and a tombstone reported, and only active albums' entries back.

## 2. Web

- [x] 2.1 Add `RecoveryProvider`, `useRecover()` and the three dialogs, the client's `recover(unit, choice, deleted?)`, and Undo through it (design decisions 3 and 5). Verify with Playwright (`recovery.e2e.ts`):
  - a destination asked for, cancelled, and chosen;
  - a taken name refused, then another used.

## 3. Docs

- [x] 3.1 Update DS-56, TS-26 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and the OpenAPI comparison with main.
