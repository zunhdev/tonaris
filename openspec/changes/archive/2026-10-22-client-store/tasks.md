# Tasks

## 1. Ports: persistence and tabs

- [x] 1.1 Add `apps/web/src/client/sync/persistence.ts`: `SyncPersistence`, `indexedDbPersistence(accountId)`, `memoryPersistence()`, and the account database's deletion (design decision 1). Verify with Bun unit tests of the memory version:
  - entries kept in creation order;
  - conflicts by `mutationId`;
  - `clear()`.

  The IndexedDB version is verified in the browser (group 6).
- [x] 1.2 Add `apps/web/src/client/sync/tabs.ts`: `TabCoordinator`, the browser version over Web Locks and BroadcastChannel, and `memoryTabs()` (design decision 3). Verify with Bun unit tests of the memory version:
  - one leader at a time, the next taking over when it stops;
  - messages reaching the other tabs only;
  - a stopped tab counting as gone for adoption, with one adopter at a time.

## 2. Writes: outbox, writer, collections

- [x] 2.1 Rework `outbox.ts` around persisted transaction entries (design decision 2): batches for several items, split at 200, persisted before sending and deleted when answered, and the adoption of gone tabs' entries. Verify with `outbox.test.ts`:
  - one entry per transaction, sent as a batch;
  - a transaction of 201 split in two;
  - entries kept until answered;
  - adopted entries sent first, in order, as unconfirmed.
- [x] 2.2 Rework `writer.ts`, and the transport for batches (design decisions 4 and 5): transaction-level persist, restored entries, persisted conflicts, and rolling back a rejected record's later transactions. Verify with tests in `sync.test.ts`, against the real API (spec: rejected values never linger; conflicts across reloads):
  - a title conflict followed by a pending year edit shows the saved title while the year saves;
  - a conflict is loaded again by a new client on the same persistence.
- [x] 2.3 Make the containers and entries collections writable (design decision 6). Verify with tests in `sync.test.ts` (spec: confirmed and rejected edits):
  - a list created, renamed and moved, and an album added to and removed from it, each settling as saved and reaching another session;
  - a name conflict rolling back;
  - three albums inserted in one transaction going as one batch request.

## 3. Engine and tabs

- [x] 3.1 Give the engine its follower mode and leadership (design decision 3), and the client its coordinator and persistence. Restore and adopt entries on start and when leading. Verify with tests in `sync.test.ts`, with `memoryTabs()` and `memoryPersistence()`:
  - two tabs hold one stream and both see a change;
  - a follower's own write settles through relayed changes;
  - when the leader stops, the follower streams and misses nothing;
  - a tab stopped with an answer-lost write has it resent by the next tab, applied once (spec: reloading while a save is in flight);
  - writes made with sends failing, then the API back, go out in order (spec: going offline and back).

## 4. The client in the app

- [x] 4.1 Add `src/features/sync/sync-provider.tsx` (design decision 7):
  - the client per signed-in account, in the workspace layout;
  - going to sign-in on `signed_out`;
  - the test hook behind `TEST_HOOKS`, rendered as a meta by the root route.

  Verify `bun run typecheck` and that the existing e2e tests still pass.
- [x] 4.2 Add the `AlertDialog` component to `packages/ui` with `bun run ui:add alert-dialog`, and the sign-out confirmation and clearing in the account menu (design decision 8). Verify with the e2e test in 5.1.

## 5. Browser tests

- [x] 5.1 Add e2e accounts and `e2e/sync-client.e2e.ts`, with `TEST_HOOKS=1` on the preview server, covering the spec in a real browser:
  - reloading after the server saved a write whose answer was lost: one album after the reload;
  - reloading with the API unreachable, then reachable: the edit applied;
  - offline, two edits, back online: both saved in order, and another session sees them;
  - two tabs: one stream request, and an edit in the follower saved in both;
  - closing the streaming tab: the other takes over and shows a later change;
  - signing out with unsent edits: the dialog, Cancel keeping them, Sign out clearing the database.

## 6. Specs and integration

- [x] 6.1 Update `docs/tech-spec.md` TS-22, TS-23 and TS-24 for what is built, and note the offline timing as TON-31's. Verify the text matches the implementation.
- [x] 6.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally
- [x] 6.3 Run `openspec validate client-store --strict` and verify it passes

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/sync-and-conflicts/spec.md` gains the new requirements after the archive and that `openspec validate --all --strict` passes.
