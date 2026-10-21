# Design

## Context

- **The pipeline exists.** The sync prototype (TON-20) built it for albums:
  - `POST /v1/mutations` validates an envelope against `mutationSchema`;
  - `executeMutation` (`packages/db/src/sync.ts`) takes the owner's write lock on `account_sync` and runs `runCommand` (`packages/domain/src/commands.ts`) on a `CollectionStore` bound to the transaction;
  - it logs each change at the next `seq` and stores the outcome under `mutationId`;
  - the hub then publishes the changes to the owner's streams.
- **The table exists.** `containers` has existed since TON-5: an adjacency list (`parent_id`, null for the root), with no foreign key on `parent_id` (TS-11). A partial unique index covers `(owner_id, coalesce(parent_id, nil), name_key)` over active rows, and a CHECK refuses blank names.
- **The bootstrap and the web client** already carry containers, read-only. The web collection (`apps/web/src/client/sync/lists.ts`) ignores stream changes.
- **`findNameConflict` and `nameKey`** (`names.ts`, `normalize.ts`) implement X-06's comparison.

## Goals / Non-Goals

**Goals:**
- One set of container rules in the domain, used by every entry point (HTTP now, MCP in M9), and testable against an in-memory store.
- Structural questions answered in O(depth) or O(subtree) SQL under the write lock, never by loading the whole tree.

**Non-Goals:**
- **Deleting, Trash and recovery** (TON-55). The commands only refuse to change trashed containers.
- **Descriptions** (TON-54).
- **Personal ordering of containers** (TS-16, TON-36).
- **Sharing effects of moves** (FR-07.9, M7).
- **Batches** (TS-25, TON-28). Each container mutation is a single envelope.
- **Optimistic container writes in the web client** (TON-30, TON-33). This change applies container stream changes only.

## Decisions

### 1. Commands decide; the store answers structural questions

`CollectionStore` gains narrow reads, and the commands combine them:

- **`findContainer(id)`:** the row, with owner and Trash state.
- **`containerPath(id)`:** the container's ancestors up to the root, nearest first, itself included.
- **`subtreeDepth(id)`:** levels of active containers from it down, itself included.
- **`activeChildren(ownerId, parentId)`:** the siblings, for `findNameConflict`.
- **`countContainers(ownerId)`**, plus insert and update.

*Why:* the rules stay in `packages/domain` (TS-02), and an in-memory store can drive property tests.

*Alternative:* store methods that enforce a rule each, such as `moveContainer` throwing on a cycle. That would split the rules between the domain and SQL, and the MCP tools would need the same SQL.

### 2. Cycle and depth from the destination's path

A move loads the destination's ancestor path with an upward recursive CTE: at most 32 rows.

- **Cycle:** the moved container appears in that path.
- **Depth:** the path's length.

The moved folder's height comes from a downward CTE over its active descendants. The move is allowed when `depth(destination) + height ≤ 32`; the root has depth 0, so a container at the root is at level 1.

TS-31 describes the cycle check as a downward search from the moved node. The upward path is equivalent, and it is needed anyway for the depth. TS-31 is updated to say so.

Trashed descendants don't count toward the height. Recovering them later re-checks depth (M5, TS-26).

### 3. Order of checks

The checks run in a fixed order, so each rejection has one clear reason:

- **A create:**
  1. authorization (`authorizeWrite`, scope `collection`);
  2. the name: blank, or over 200 code points;
  3. an existing ID (an idempotent retry);
  4. the destination;
  5. depth;
  6. sibling names;
  7. the container count.
- **A rename or move:**
  1. existence (`not_found`), then authorization against its owner, as album updates do;
  2. for a rename, the name;
  3. Trash (`trashed`);
  4. CAS on `base` (TS-21): a stale view is reported as a `conflict` before any rule is judged against it;
  5. for a move, the destination, then a `cycle`, then depth;
  6. sibling names.

**Destination checks.** A missing, someone else's or trashed destination answers `invalid_destination`, as does a list, so a move can't probe for other people's IDs. A container being renamed or moved that is someone else's answers `permission_denied`, as albums do.

### 4. Names

- The command trims surrounding whitespace before checking and storing.
- The length limit is counted in code points, so an emoji counts once.
- The unique index on `name_key` stays as a backstop. Writes are serialized per owner, so the command's check, made under the lock, is what decides.

### 5. Idempotent creates and no-op changes

- **Creates** follow `album.create`. An existing ID with the same values is `confirmed` with no change; with different values it is a `conflict`. Another owner's ID is `validation_failed`.
- **No-op changes.** Renaming to the identical name, or moving to the current parent, is confirmed without a change and uses no `seq`.

### 6. Changes carry the whole container

The change log gets `entity: "container"`, with `data` set to `{id, kind, parentId, name}`, the shape the bootstrap uses.

A move logs only the moved container. Descendants keep their `parent_id`, and clients rebuild the tree from parents. That keeps moves O(1), as TS-31 intends.

### 7. Limits in one module

`packages/domain/src/limits.ts` holds TS-18's values as constants: containers 2,000, depth 32, names 200, with the other values added as their features arrive. The count includes Trash (decided 21 October 2026).

### 8. Property tests with fast-check

`fast-check`, pinned, runs random sequences of create, rename and move against the in-memory store. After every step it asserts the invariants:

- every parent is the root or a folder;
- there are no cycles;
- no container is deeper than 32;
- active sibling names are unique;
- a rejected command changed nothing.

The same scenarios run as integration tests through `executeMutation` on Postgres, and through `POST /v1/mutations`.

## Risks / Trade-offs

- **Adding to the `Change` union in a response.** oasdiff (`--fail-on ERR` in CI) could flag a new member of a response `oneOf`. → It is additive, and clients must tolerate new entities (TS-09). The web client already skips entities it doesn't know. If oasdiff flags it as an error, mark the change in the PR rather than restructure the contract.
- **Recursive CTEs on every move.** → They are bounded by depth 32 and 2,000 containers per account, under a lock held only by this account's writes.
- **Old web tabs.** They ignore container changes until they reload, as they do today. → Acceptable; TON-30 replaces the client store.

## Migration Plan

No schema migration: the table, index and CHECKs exist. Deploying adds mutation names and change entities, and rolling back removes them. Containers created meanwhile remain valid rows, which the previous version shows read-only.
