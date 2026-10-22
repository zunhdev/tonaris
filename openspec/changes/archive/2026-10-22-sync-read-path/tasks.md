# Tasks

## 1. Streams end with their session

- [x] 1.1 Add `activeSessionIds(db, ids, now)` to `packages/db/src/accounts.ts`. Verify with an integration test: of a live, an expired and a deleted session, only the live one is returned.
- [x] 1.2 In `apps/api/src/sync/hub.ts`, record each stream's session, add the `sessions` source with a 30 s check while streams are open, and add `endSessions` (design decision 1). Verify with `hub.test.ts` unit tests:
  - a stream whose session stops being active ends at the next check, while others continue;
  - `endSessions` ends a session's streams at once;
  - no check runs while no stream is open;
  - a failed check keeps the streams.
- [x] 1.3 Pass the session ID from the `signedIn` guard to the stream route, and give the production, local and test hubs the database session source. Verify with a conformance test in `apps/api/src/sync/sync.test.ts`, with a short check interval: signing out ends that session's stream, its reconnect gets 401, and another session's stream continues (spec: signing out ends the session's streams).

## 2. The daily prune

- [x] 2.1 Add `apps/api/src/schedules.ts` (design decision 2), let `pruneSyncHistory` take a transaction, and start the `prune-sync-history` schedule in `src/index.ts`, stopping it on shutdown before the database closes. Verify with integration tests in `apps/api/src/schedules.test.ts`:
  - a run prunes changes and outcomes older than 30 days and keeps newer ones;
  - two runs started at once run the task once;
  - `stop()` waits for a run in progress.

## 3. Compressed responses

- [x] 3.1 Add `apps/api/src/compression.ts` and use it in `createApp` (design decision 3). Verify with tests in `apps/api/src/compression.test.ts`:
  - the bootstrap is gzipped for a client that accepts gzip, with `Vary`, and decodes to the same snapshot;
  - a client without gzip, a small response and the event stream aren't compressed;
  - a problem response over 1 KB is compressed, and keeps its status and headers, cookies included.

## 4. Documentation

- [x] 4.1 Write `docs/api/sync-protocol.md` (design decision 5). Verify that every endpoint, event, outcome status and limit it names matches `apps/api/openapi/v1.json` and TS-18 to TS-28.
- [x] 4.2 Update `docs/tech-spec.md`:
  - TS-23: session checks, and the stream ending without `reset`;
  - TS-24: the bootstrap's shape and compression;
  - TS-28: the document exists;
  - TS-90 and TS-91: the schedule mechanism and its first job;
  - TS-120: compression built, and the grouping measurement.

  Verify the text matches the implementation.

## 5. Integration

- [x] 5.1 Confirm the existing tests still cover the spec's other scenarios: delivery to another session, a consistent bootstrap under writes, resume after a cut, keepalives, and `reset` for old and unknown cursors. Verify by running `bun test apps/api/src/sync apps/api/src/sse.test.ts packages/db/src/sync.test.ts`.
- [x] 5.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally
- [x] 5.3 Run `openspec validate sync-read-path --strict` and verify it passes

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/sync-and-conflicts/spec.md` gains the new requirements after the archive and that `openspec validate --all --strict` passes.
