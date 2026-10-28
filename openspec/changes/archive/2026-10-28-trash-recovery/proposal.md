# Proposal

Linear: TON-56 (Feature). Implements:
- FR-01.14, recovery reusing only active albums and reporting what it skipped;
- FR-01.15, choosing a destination when the original parent is unavailable;
- FR-01.16, choosing a name on a collision.

Design: DS-56 (recovery prompts). Tech: TS-26. Done when AC-27 passes.

## Why

TON-55 made `trash.recover` answer `needs_input` for a destination or a name, but nothing asks the owner. Its outcome also doesn't say which entries stayed out. AC-27 asks that recovery:
- uses active albums only;
- reports skipped items;
- asks for a destination or new name;
- keeps the expiry running while pending, and changes nothing when cancelled.

## What Changes

- **The skip report.** `trash.recover`'s `confirmed` result is `{skipped: [{albumId, title, artist, listId, reason}]}`:
  - an entry whose album is in Trash: `album_in_trash`, with its list;
  - an album purged while the unit referred to it, from the unit's tombstones (TS-13): `album_deleted`.
- **The unit record gains `parentId`,** the root's folder at deletion, so a client knows where recovery returns it and when to ask. DS-55's former location uses it too.
- **The prompts (DS-56)**, in a recovery flow any surface uses (Undo now; the Trash view in TON-59):
  - **Destination:** "'Metal' is in Trash or no longer exists. Choose where to restore 'Doom'." with the collection and every active folder, then **Restore** or **Cancel**.
  - **Name:** "'Collection' already has a list or folder named 'Doom'." with the name selected for editing, "Choose another location…", then **Restore** or **Cancel**. The same name or another taken one is refused with its reason.
  - **After recovering:** "Restored 'Doom'", or "Restored · 2 memberships skipped" with **Details**, which lists each album and why.
- **The client asks before sending,** from the collection it holds. The server still answers `needs_input` if something changed meanwhile. A recovery that renames does so while the unit is still in Trash, so the old name never meets an active sibling.
- **Undo** of a deleted list runs this recovery.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trash-and-recovery`: gains the skip report and the prompts.

## Impact

- **`packages/domain`:**
  - the result schema and the skip report;
  - tombstones on stored units;
  - the unit's `parentId`;
  - renaming before recovering.
- **`packages/db`:** units' tombstones and their root's parent.
- **`apps/api`:** the regenerated OpenAPI document; responses gain `parentId`, and requests are unchanged.
- **`apps/web`:**
  - `RecoveryProvider` and `useRecover()`, with the three dialogs;
  - the client's `trash.recover(unit, choice, deleted?)`;
  - Undo using it.
- **No schema change.**
