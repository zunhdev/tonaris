# Tasks

## 1. Domain

- [x] 1.1 Add `in_progress` to the error codes, `needs_input` to `CommandResult`, and the `{source, values}` prefill, updating `identificationOutcome()` (design decisions 2 and 4). Verify with `outcomes.test.ts` and `identify.test.ts`.
- [x] 1.2 Add `packages/domain/src/capture.ts` and `album.capture` to `mutationSchema`, with the store's new methods in `CollectionStore` and `memoryStore` (design decisions 2, 4 and 6). Verify with `capture.test.ts` on the memory store:
  - reuse by link, by release group and by merge match; an edition's link reusing its album; a different release group creating one (specs: another edition of a saved album; a merged release group; same title, different album);
  - already in the list (spec: already in the list);
  - re-addition into a list and without one, an entry in a trashed list kept, an active record winning (specs: re-added into a list; re-added without a list; an entry in a trashed list is kept; an active record wins);
  - Unsorted for a new album, and a reused album keeping its lists (specs: a new album without a list; a reused album keeps its lists);
  - a missing year asking for details, and details saved with their sources (specs: MusicBrainz has no year; the details are given; Apple's hints kept);
  - links filled, equivalent, and kept (specs: a second service's link; a different link for the same service);
  - the destination's checks, and an ID already taken.

## 2. Database

- [x] 2.1 Move enrichment's plan write to `album-writes.ts`, and implement the store's new methods (design decision 6). Verify with the existing `enrichment.test.ts` and integration tests of `reactivateAlbum()`: the Trash unit gone, active-list entries removed, trashed-list entries kept.
- [x] 2.2 Add `claimMutation()`, `finishMutation()` and `executeMutation()`'s `claimed` option, and `executeBatch()`'s item runner (design decision 5). Verify with tests: a replay, in progress, a claim refreshed after 5 minutes, and a claimed mutation finished once (specs: an abandoned run).
- [x] 2.3 Add `albumsOfReleaseGroup()` and `mergeCandidates()`, and make `findLinkedAlbum()` prefer an active album (design decision 3). Verify with tests: candidates by artist and title containment, Trash included, at most 5.

## 3. API

- [x] 3.1 Add `apps/api/src/capture.ts`: `prepareCapture()` and the capture runner, with the providers passed to the app (design decisions 3 and 5). Wire the mutation and batch routes, `in_progress` on `GET /v1/mutations/{id}`, and the idle timeout. Regenerate the OpenAPI document.
- [x] 3.2 Verify with `capture.test.ts` through the API, with identification and MusicBrainz stubbed:
  - every scenario of 1.2 end to end, including the changes reaching the stream;
  - two albums fitting, the choice resubmitted, a choice not offered, and a batch going on past it (specs: two albums fit; the person chooses; independent items go on);
  - a merged release group found through its candidate (spec: a merged release group);
  - `409 in_progress` for a resend and for `GET` while running, then the outcome (specs: sent again while running; looked up while running);
  - `provider_unavailable` with nothing written.

## 4. Web

- [x] 4.1 Add `album.capture` to `describeWrite()` and the batch dependencies (design decision 7). Verify with their unit tests.

## 5. Docs

- [x] 5.1 Update `docs/tech-spec.md` as built: TS-22 (`claimMutation()`, `in_progress`, 5 minutes), TS-26 (the resubmissions), TS-27 (`in_progress`), TS-44 (matching as built, merge candidates), TS-13 (re-addition), and TS-41's prefill shape. Update DS-48 with the result each toast reads. Verify the text matches the implementation.

## 6. Checks

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 6.2 Run `openspec validate album-matching --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `link-capture` and `sync-and-conflicts`, and that `openspec validate --all --strict` passes.
