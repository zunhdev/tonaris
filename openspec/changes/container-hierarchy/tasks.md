# Tasks

## 1. Setup

- [x] 1.1 Add `fast-check` (exact version) as a dev dependency of `packages/domain` with `bun add -d`, and verify `bun run check:workspace` passes with it pinned
- [x] 1.2 Add `packages/domain/src/limits.ts` with TS-18's container limits (2,000 containers including Trash, depth 32, names 200 characters), exported from the package index, and verify `bun run typecheck` passes

## 2. Domain: container commands

- [x] 2.1 Add the `container.create`, `container.rename` and `container.move` envelopes to `mutationSchema`, and `entity: "container"` to `changeSchema`, in `packages/domain/src/sync.ts`; verify with unit tests that each envelope parses and an unknown kind or a non-v7 ID is refused
- [x] 2.2 Extend `CollectionStore` and `ChangeInput` for containers (design decision 1). Implement `container.create` in `commands.ts`:
  - parent checks;
  - trimmed names;
  - sibling uniqueness;
  - depth and count limits;
  - idempotent re-create.

  Verify with in-memory store unit tests for these spec scenarios: create at the root and inside folders, lists hold no containers, nesting stops at 32 levels, a retried create duplicates nothing, the list-and-folder name collision, the same name under different parents, blank or overlong names, names keep their spelling, and creating past the limit.
- [x] 2.3 Implement `container.rename`:
  - CAS on `base.name`;
  - case-only rename;
  - the no-op;
  - refusing trashed and foreign containers.

  Verify with unit tests for these scenarios: rename a list, a case-only rename, a rename into a sibling's name, a stale rename, a container in Trash, and another person's container.
- [x] 2.4 Implement `container.move`:
  - CAS on `base.parentId`;
  - destination checks, cycle, depth with the subtree height, and the name at the destination;
  - the no-op, in the order of design decision 3.

  Verify with unit tests for these scenarios:
  - a folder moving with everything under it;
  - a folder into its own subtree;
  - a list, foreign, missing or trashed destination;
  - a move nesting too deep;
  - a list moving to another folder;
  - a move into a sibling's name;
  - a stale move.
- [x] 2.5 Add a fast-check property test that runs random create, rename and move sequences against the in-memory store and asserts design decision 8's invariants after every step, and verify it passes with the default 100 runs

## 3. Database: the store on the write transaction

- [x] 3.1 Implement the container store methods in `packages/db/src/sync.ts`: the ancestor path and subtree depth as recursive CTEs (TS-31), active children, the count with Trash, insert and update. Log container changes. Verify with `packages/db/src/sync.test.ts` integration tests through `executeMutation`:
  - nested creates and a subtree move, with descendants keeping their IDs and parents;
  - a cycle and a too-deep move rejected without using a `seq`;
  - a trashed container (inserted directly) refused, and its name not reserved;
  - the count including trashed containers;
  - a container change logged at the next `seq` and replayed on retry.
- [x] 3.2 Update TS-31 in `docs/tech-spec.md` for the upward-path cycle check and the depth rule (design decision 2), and TS-18 for counting Trash. Verify the text matches the implementation.

## 4. API: mutations and the stream

- [x] 4.1 Regenerate `apps/api/openapi/v1.json` with `bun run openapi:generate`. Verify `bun run openapi:check` passes and the document's only changes are additions: the three envelopes and the container change.
- [x] 4.2 Add conformance tests to `apps/api/src/sync/sync.test.ts`:
  - create, rename and move through `POST /v1/mutations`;
  - the outcome codes: `name_conflict`, `cycle`, `invalid_destination`, `limit_exceeded`, `conflict`;
  - the changes on the owner's stream, and in a fresh bootstrap (spec: hierarchy changes reach every session);
  - another account's container refused.

## 5. Web: live containers

- [x] 5.1 Make the container collection in `apps/web/src/client/sync/lists.ts` apply `container` changes from the stream, as the album collection does. Verify with a test in `apps/web/src/client/sync/sync.test.ts`: a list created and then renamed through the API appears, and then changes, in an open client without reloading.

## 6. Integration

- [x] 6.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally
- [x] 6.2 Run `openspec validate container-hierarchy --strict` and verify it passes

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/collection-hierarchy/spec.md` exists after the archive and that `openspec validate --all --strict` passes.
