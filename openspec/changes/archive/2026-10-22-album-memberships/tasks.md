# Tasks

## 1. Albums, not editions

- [x] 1.1 Remove `editionLabel` and `barcode` from the `albums` schema in `packages/db/src/schema/collection.ts` and generate the migration with `bun run db:generate --name drop_edition_columns`. Verify:
  - the migration only drops the two columns;
  - `bun run db:check` passes;
  - a `packages/db/src/schema.test.ts` test shows the migrated table has neither column (spec: no edition details are stored).
- [x] 1.2 Drop edition labels, barcodes and `reissue` records from the workload generator (`tooling/src/workload/generate.ts`, `vocabulary.ts`; design decision 8). Verify `bun test tooling` passes, with the TS-120 shape tests unchanged.
- [x] 1.3 Update TS-11 in `docs/tech-spec.md`: the columns are dropped. Verify the text matches the schema.

## 2. Domain: entry commands

- [x] 2.1 In `packages/domain`:
  - add `maxMemberships` (50,000, Trash included) to `limits.ts`;
  - add `membershipKey` and the `membership.add` and `membership.remove` envelopes, `membershipAddResultSchema`, and `entity: "membership"` in `changeSchema` to `sync.ts`;
  - export them from the index.

  Verify with unit tests that the envelopes parse, a non-UUID ID is refused, and a membership change parses with a `<listId>:<albumId>` key and null data on delete.
- [x] 2.2 Extend the store and the command result (design decisions 3, 5 and 6):
  - `StoredAlbum.trashed`;
  - the entry store methods;
  - `now` on `CommandContext`;
  - an optional `result` on `applied`;
  - the in-memory store in `testing.ts`.

  Verify `bun run typecheck` passes and the existing command tests still pass.
- [x] 2.3 Implement `membership.add` and `membership.remove` in a new `memberships.ts`, in design decision 2's order. Verify with in-memory store unit tests in `memberships.test.ts`, one per spec scenario:
  - an album in two lists, and an edit from one list showing in both;
  - adding to a list, and adding it again;
  - folders, Trash on either side, and other people's lists and albums refused;
  - removing one of several entries, the last entry, and an absent one;
  - adding past the limit, with remove and re-add still working;
  - a read-only connection refused.
- [x] 2.4 Add the FR-02.6 cases to `commands.test.ts`. Verify one test per spec scenario:
  - each missing value named;
  - a live album saved on its recording year, with its original year left unknown;
  - only a recording year refused for an album that isn't live, or isn't known to be;
  - an edit clearing the artist or the only year refused.

## 3. Database: entries on the write transaction

- [x] 3.1 Implement the entry store methods in `packages/db/src/sync.ts`, with `findAlbum` reporting Trash. Store a command's `result` in the confirmed outcome, and pass `now` to the commands. Verify with `packages/db/src/sync.test.ts` integration tests through `executeMutation`:
  - an add logged at the next `seq` with the server's `addedAt`, and replayed on retry;
  - a re-add that keeps `addedAt`, uses no `seq` and reports `alreadyInList`;
  - a remove logged as a delete;
  - the bootstrap holding one album and its two entries;
  - the limit counting entries of a list in Trash.
- [x] 3.2 Test Unsorted through the server's existing count and search (spec: Unsorted, and removing a list keeps its albums). In `packages/db` integration tests, verify that:
  - `collectionOverview` counts a new album in no list as unsorted, and the album count holds when the last entry is removed;
  - `searchAlbums` still finds it;
  - adding it to a list takes it out of the count;
  - a list put in Trash leaves an album that is also in another list sorted, and puts one in no other list in Unsorted.
- [x] 3.3 Update TS-18 in `docs/tech-spec.md` for entries counting Trash (decided 22 October 2026), and TS-24 for entries no longer being read-only. Verify the text matches `limits.ts` and the bootstrap.

## 4. API: mutations and the stream

- [x] 4.1 Regenerate `apps/api/openapi/v1.json` with `bun run openapi:generate`. Verify `bun run openapi:check` passes and the only changes are additions: the two envelopes and the membership change.
- [x] 4.2 Add conformance tests to `apps/api/src/sync/sync.test.ts`:
  - an add, a re-add and a remove through `POST /v1/mutations`, on another session's stream and in a fresh bootstrap;
  - the rejection codes `invalid_destination`, `not_found` and `permission_denied`, with nothing streamed.

## 5. Web: live entries

- [x] 5.1 Make the entry collection in `apps/web/src/client/sync/lists.ts` apply `membership` changes from the stream. Verify with a test in `apps/web/src/client/sync/sync.test.ts`: an album added to a list through the API appears in an open client's entries, and its removal takes it out, without reloading (spec: another session sees an album added and removed).

## 6. Integration

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally
- [x] 6.2 Run `openspec validate album-memberships --strict` and verify it passes

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/album-records/spec.md` exists after the archive and that `openspec validate --all --strict` passes.
