# Proposal

Linear: TON-26 (Feature). Implements FR-01.1 (hierarchy), FR-01.2 (sibling-name uniqueness), the rename part of FR-01.3, FR-01.4 (folder moves) and FR-01.5 (list moves), with X-05 (rejections change nothing), X-06 (name uniqueness) and the container limits of FR-15.4. Tech: TS-11, TS-18, TS-20, TS-21, TS-31. Covers the domain and API side of AC-03 and AC-04; sharing effects (FR-07.9) land in M7, descriptions in TON-54, and the sidebar tree in TON-33.

## Why

An account can hold albums but nothing to put them in. Folders and lists exist only as rows the bootstrap reads, with no command to create, rename or move them. Every later M2 issue needs them:
- memberships and Unsorted (TON-27);
- the sidebar tree (TON-33);
- views and manual order (TON-34 to TON-36);
- Trash (TON-55).

The rules that keep a hierarchy sound (unique sibling names, no cycles, bounded depth) have to live in one domain command that the app and MCP share.

## What Changes

- **Three new mutations** on `POST /v1/mutations` (TS-20), run under the owner's write lock like the album commands:
  - `container.create {id, kind, parentId, name}`: a folder or list at the root or inside an active folder the owner has, with the client's ID (TS-10). A retried create duplicates nothing.
  - `container.rename {id, name}`, with `base {name}`. A case-only rename is allowed.
  - `container.move {id, parentId}`, with `base {parentId}`. The container keeps its ID, so its descendants, memberships and preferences come along without copying.
- **Rejections change nothing (X-05)**, with TS-27 codes:
  - `name_conflict`: an active sibling of either kind already has the name, compared case-insensitively;
  - `cycle`: a folder moved into itself or a descendant;
  - `invalid_destination`: a parent that is a list, in Trash, someone else's or missing;
  - `limit_exceeded`: depth beyond 32, or more than 2,000 folders and lists, Trash included (TS-18, decided 21 October 2026);
  - `validation_failed`: a blank name, or one over 200 characters;
  - `trashed`: a container in Trash;
  - `conflict`: a stale `base`.
- **Names** are trimmed of surrounding whitespace and otherwise kept as typed (X-06).
- **Container changes** go into the change log and the owner stream (`entity: "container"`), and the bootstrap carries them, as for albums (TS-23, TS-24).
- **The limits** become constants in `packages/domain/src/limits.ts` (TS-18).
- **The web sync client** applies container changes from the stream, so another session's new, renamed or moved folders and lists appear live. Optimistic container writes from the web come with the sidebar (TON-33) and the client store (TON-30).
- **Tooling:** add `fast-check` (pinned) for the property tests TS-121 plans for hierarchy moves.

## Capabilities

### New Capabilities

- `collection-hierarchy`: the owner's folders and lists, and the rules that keep their tree sound:
  - nesting;
  - sibling-name uniqueness;
  - rename;
  - moves without copying;
  - cycle, destination, depth and count limits.

  Trash, descriptions and sharing effects add to it later.

### Modified Capabilities

None.

## Impact

- **Domain** (`packages/domain`):
  - container commands in `commands.ts` and `containers.ts`;
  - new store methods on `CollectionStore`;
  - the mutation and change schemas in `sync.ts`;
  - a new `limits.ts`.
- **Database** (`packages/db/src/sync.ts`): the store implemented on the write transaction, with recursive CTEs for the ancestor path and subtree depth (TS-31). No migration: the `containers` table and its unique sibling-name index exist since TON-5.
- **API:** no new route. `POST /v1/mutations` takes the new mutation names, and the stream sends container changes. The committed OpenAPI document is regenerated; the changes are additive (TS-09).
- **Web** (`apps/web/src/client/sync/lists.ts`): the container collection applies stream changes.
- **Dependencies:** `fast-check` as a dev dependency of `packages/domain`.
