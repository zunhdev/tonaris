# Tasks

## 1. Domain and database

- [x] 1.1 Split the record, and add the command, the mutation and the limit (design decisions 1 and 2); read and write the column. Verify with `container-descriptions.test.ts` in the domain (set, trimmed, cleared, too long, conflict, a move, Trash) and in Postgres (Trash and recovery, the bootstrap, search not matching).

## 2. Web

- [x] 2.1 Show and edit descriptions, with the row excerpt and the collection's writes (design decision 3), and regenerate the OpenAPI document. Verify with unit tests, `sync.test.ts` (a description reaching another session, and a list created with one), and Playwright (`descriptions.e2e.ts`):
  - written in Editing mode;
  - shown in Viewing mode and in rows;
  - kept through a move and a reload;
  - cleared.

## 3. Docs

- [x] 3.1 Update DS-41, TS-11 and `docs/api/sync-protocol.md` as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and the OpenAPI comparison with main.
