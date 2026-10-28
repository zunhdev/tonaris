# Proposal

Linear: TON-55 (Feature). Implements:
- FR-01.11, deleting folders and lists into Trash, a folder confirmed (X-07);
- FR-01.12, Trash as the owner's recovery area, out of active views;
- FR-01.13, Trash units.

Design: DS-50 (deletion feedback), DS-28 (the confirmation). Tech: TS-13. Done when property tests cover unit semantics: content deleted together versus separately.

## Why

Folders and lists can't be deleted. `trash_units` and the `trashed_at` columns exist (TS-13), but only MCP's album deletion uses them. Clients see trashed folders as active, and none of their content leaves active views.

## What Changes

- **`container.delete {id, unitId}`** moves a folder or list to Trash, as one unit with the client's ID (TS-10).
  - The unit is the container and every active descendant; one already in Trash keeps its own unit.
  - It has one deletion time and expires 30 days later.
  - Memberships stay stored, but stop being effective, so albums in no other active list enter Unsorted, at its top (DS-51).
- **`trash.recover {unitId, parentId?, name?}`** recovers a unit, so that list deletion can be undone (DS-50).
  - Its arguments are final now, for TON-56's prompts:
    - without a usable original parent, it answers `needs_input: destination`;
    - with a name taken among the new siblings, `needs_input: name`;
    - `parentId` and `name` resubmit the choice (FR-01.15, FR-01.16, TS-26).
  - Recovered memberships become effective again for active albums.
- **Clients hold active content only:**
  - the bootstrap and stream carry active folders and lists, and the memberships of active lists;
  - deleting sends their removal, and recovering their return;
  - a new `trashUnit` record (id, kind, root, name, contents, deletion and expiry) is in the bootstrap and on the stream, for undo now and the Trash view later (TON-59).
- **The web:**
  - **⌫** deletes the focused folder or list, in the sidebar or a view; Editing mode adds **Delete list** or **Delete folder** to a folder's or list's header.
  - **A list** goes at once, with "1 list moved to Trash · Undo"; Undo recovers it.
  - **A folder** goes after the standard confirmation, with its hierarchy's counts and first names, and that albums stay in other lists or Unsorted.
- **Property tests:** content deleted together versus separately.

## Capabilities

### New Capabilities

- `trash-and-recovery`: Trash units, deletion of folders and lists, and recovery.

### Modified Capabilities

None.

## Impact

- **`packages/domain`:**
  - `trash.ts`: the unit record, the commands and their store methods;
  - the two mutations;
  - the `trashUnit` change;
  - the bootstrap's `trashUnits`.
- **`packages/db`:**
  - the store's methods;
  - active-only containers and memberships in the bootstrap;
  - units in the bootstrap.
- **`apps/api`:** the regenerated OpenAPI document; requests only gain the two mutations.
- **`apps/web`:**
  - the trash units collection, and deletion and recovery as transactions;
  - ⌫, the header button, the toast and the confirmation;
  - descriptions, retries and dependencies.
- **No schema change.**
