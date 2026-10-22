# Tasks

## 1. Domain: batches

- [x] 1.1 In `packages/domain`:
  - add `maxBatchItems` (200) to `limits.ts`;
  - widen the `skipped` outcome's `because` to `failed | conflict | skipped | needs_input | needs_approval | pending` in `outcomes.ts`;
  - add `batches.ts` with `batchItemSchema`, the loose `batchSchema` frame (1–200 items, v7 IDs, no repeated `mutationId`) and `batchResultSchema`;
  - export them from the index.

  Verify with unit tests in `batches.test.ts` (spec: too many items, and the frame's other refusals):
  - a batch parses;
  - 0 or 201 items, a repeated or non-v7 `mutationId`, and a non-v7 `batchId` are refused.
- [x] 1.2 Implement `runBatch` in `batches.ts` (design decisions 4–6). Verify with unit tests in `batches.test.ts`, with a stub `run`, one per spec scenario:
  - a partial batch keeps each outcome in order;
  - an invalid item fails with item-relative paths while the others run;
  - a failed, conflicting or skipped prerequisite skips its dependent with that reason, down the chain;
  - a confirmed prerequisite lets its dependent run;
  - a dependency on a later or unknown item fails as invalid;
  - `run` gets the envelope without `dependsOn`, and is never called for skipped or invalid items.

## 2. Database: `executeBatch`

- [x] 2.1 Implement `executeBatch` in `packages/db/src/sync.ts`: `runBatch` over `executeMutation`, calling `onExecuted` after each item commits. Verify with `packages/db/src/sync.test.ts` integration tests:
  - a partial batch whose successes stay committed after a later item fails;
  - a dependent skipped after a failed prerequisite, with no `seq` used;
  - `onExecuted` called per item in `seq` order;
  - a batch sent again that applies nothing twice and runs only what didn't run;
  - two copies of a batch at once, each item applied once and both answers alike.

## 3. API: `POST /v1/batches`

- [x] 3.1 Add the route to `apps/api/src/sync/routes.ts`, publishing each item's changes as `onExecuted` reports them. Add the `BatchItem` component in `apps/api/src/openapi.ts`, and regenerate `apps/api/openapi/v1.json`. Verify:
  - `bun run openapi:check` passes;
  - the document's changes are additions: the route, the component and the `because` values.
- [x] 3.2 Add conformance tests to `apps/api/src/sync/sync.test.ts`:
  - a partial batch;
  - an invalid item among valid ones;
  - a create-then-add batch whose create fails, and one whose create succeeds;
  - an item refused for another person's list;
  - 201 items and repeated IDs refused with 422, running nothing;
  - the items' changes on another session's stream;
  - a resent batch replaying its outcomes;
  - 401 without a session.
- [x] 3.3 Add the single-mutation cases TON-20 left untested at the API (spec: two sessions save the same field at once; copies arriving together). Verify with conformance tests:
  - two sessions retitle one album at once from its current title: exactly one is saved and the other is a conflict;
  - five copies of one mutation sent at once apply once, with one change on the stream.

## 4. Specs

- [x] 4.1 Update `docs/tech-spec.md`:
  - TS-20: batches go to `POST /v1/batches`;
  - TS-25: per-item validation, earlier-item dependencies, skipped items not stored, publishing per item;
  - TS-27: the `skipped` reasons;
  - TS-18 and TS-66: 200 items for every batch (decided 22 October 2026).

  Verify the text matches the implementation.

## 5. Integration

- [x] 5.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally
- [x] 5.2 Run `openspec validate mutation-batches --strict` and verify it passes

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/sync-and-conflicts/spec.md` exists after the archive and that `openspec validate --all --strict` passes.
