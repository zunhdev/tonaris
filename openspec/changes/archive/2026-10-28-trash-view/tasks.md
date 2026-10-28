# Tasks

## 1. Record

- [x] 1.1 Add `members` and `artist` to the unit record, where units are made and in the bootstrap (design decision 1). Verify with the existing Trash tests.

## 2. Web

- [x] 2.1 Add the Trash page and its dialogs, replacing the placeholder (design decisions 2 and 3). Verify with Playwright (`trash-view.e2e.ts`):
  - a folder's row, its read-only contents and the filter;
  - R restoring;
  - an album restored with a skipped entry reported;
  - deleting permanently and emptying Trash, confirmed.

## 3. Docs

- [x] 3.1 Update DS-55, DS-57 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and the OpenAPI comparison with main.
