# Tasks

## 1. Domain and database

- [x] 1.1 Add `album.delete`, album units in `trash.recover`, capture's reactivation changes, the store methods, and active-only albums in the bootstrap (design decisions 1 to 4). Verify with `trash.test.ts` in the domain and Postgres:
  - deletion and resend;
  - restore to active lists, with a trashed list reported;
  - Unsorted when none is left;
  - the same-album pause changing nothing.

  Verify with `capture.test.ts`: a re-added album sent back.

## 2. Web

- [x] 2.1 Add `deleteAlbum`, ⌘⌫, the inspector button, the confirmation, and the same-album dialog (design decision 5). Verify with `sync.test.ts` (deleted and restored across sessions) and Playwright (`album-trash.e2e.ts`: ⌘⌫ and the inspector, confirmed).

## 3. Docs

- [x] 3.1 Update DS-50, DS-56, DS-78, TS-13 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and the OpenAPI comparison with main.
