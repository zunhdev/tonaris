# Design

## Context

- **The tables exist (TS-13):**
  - `trash_units`: `id`, `owner_id`, `kind`, `root_id`, `deleted_at`, `expires_at`, `tombstones`;
  - `trashed_at` and `trash_unit_id` on `containers` and `albums`.
- **MCP's album deletion** makes album units, but writes no changes. Album deletion in the app is TON-57.
- **Clients receive every container, trashed ones included,** and every membership. Unsorted is computed on the client as albums with no membership in a known list, so clients must drop the memberships of trashed lists.
- **Arguments can't change after merging** (oasdiff), so `trash.recover`'s are designed in full here, for TON-56's prompts.

## Goals / Non-Goals

**Goals:**
- folder and list deletion, and the recovery Undo needs;
- the unit record on clients;
- the property tests.

**Non-Goals:**
- the skip report and the prompts' interface (TON-56);
- album deletion and restore (TON-57);
- expiry and purge (TON-58);
- the Trash view (TON-59);
- multi-select (X), which doesn't exist yet;
- sharing (M7).

## Decisions

### 1. Units

- **The client record** (`TrashUnit`): `{id, kind: "folder"|"list"|"album", rootId, name, deletedAt, expiresAt, folders, lists}`.
  - `name` is the root's (an album's title).
  - `folders` and `lists` count the unit's members below the root.
- **Changes:** the `trashUnit` entity, keyed by ID. The bootstrap gains `trashUnits`.
- **Expiry:** 30 days after deletion (`trashRetentionDays`).

### 2. `container.delete {id, unitId}`

- **The unit's ID** is a UUIDv7 from the client (TS-10), so Undo can name the unit before the server answers.
- **Checks:** the container must be active and the owner's (`changeableContainer`). A resend with the same unit changes nothing.
- **Under the lock:**
  - the unit is the root and its active descendants (`activeSubtree`), stamped with the unit;
  - the root's place in its parent's arrangement goes;
  - each album of the trashed lists that is now in no active list gets a key at Unsorted's top (`placeAtTop`).
- **Changes:**
  - a `container` delete for each member;
  - a `membership` delete for each entry of the trashed lists, as clients hold effective memberships only;
  - the positions;
  - the `trashUnit` insert.

### 3. `trash.recover {unitId, parentId?, name?}`

- **The unit:** a folder or list unit of the owner's. A missing one is `not_found` ("This is no longer in Trash."), and an album unit is refused until TON-57.
- **The destination:** `parentId` if given (null is the root); otherwise the root's original parent.
  - **No usable parent:** a folder that isn't active and the owner's gives `needs_input` `destination`, with `{unitId, name, parentId, reason: "missing" | "trashed"}`.
  - **An explicit destination:** checked like a move's: an active folder, within 32 levels.
- **The name:** `name` if given, otherwise the root's.
  - It is checked like a rename.
  - Taken by an active sibling, it gives `needs_input` `name`, with `{unitId, name, parentId}`.
- **Recovery:**
  - clears the members' Trash marks and deletes the unit;
  - sets the root's parent and name;
  - albums of recovered lists that were in Unsorted leave it (`forgetPlace`).
- **Changes:**
  - a `container` insert for each member;
  - a `membership` insert for each entry with an active album and list;
  - the positions;
  - the `trashUnit` delete.

### 4. Active-only reads

- **The bootstrap:**
  - containers with `trashed_at` null;
  - memberships whose list is active;
  - units with their root's name and their member counts.
- **Other reads** already use active content: `activeChildren` and `inActiveList`.

### 5. The web

- **`client.trash`:**
  - `deleteContainers(ids)`: one transaction that deletes each root and its descendants, and their lists' memberships, from the collections. It persists one `container.delete` per root and returns the unit IDs and removed rows.
  - `recover(units, rows)`: one transaction that puts them back and persists `trash.recover` per unit.
  - Neither uses the collections' own handlers, as in `positions.ts`.
- **⌫ (Backspace or Delete):** a new shortcut on the focused tree item, or the focused folder or list row. Like M, it switches to Editing mode (DS-45) and waits while offline.
- **Editing mode's header:** **Delete list** or **Delete folder** on a folder's or list's page.
- **A list:**
  - deleted at once;
  - the toast "1 list moved to Trash", with Undo, recovering it;
  - a page showing it goes to its parent.
- **A folder:** `ConfirmDialog`:
  - title "Delete folder 'Metal'?";
  - scope "The folder and 2 folders and 6 lists inside it: Doom, Sludge, …" (the first three names);
  - consequences "Albums stay in their other lists or in Unsorted." and "Recoverable from Trash for 30 days.";
  - action "Move 1 folder and 6 lists to Trash" (all folders, the root included).
- **Descriptions:** "Delete the list 'Doom'", "Recover from Trash".
- **Dependencies:** recovery depends on the deletion creating its unit.

## Risks / Trade-offs

- **[Large folders]** → Deleting one with thousands of entries logs a change per entry. It is rare, bounded by TS-18's limits, and keeps clients exact.
- **[Album units from MCP]** → They appear as units now. Their recovery waits for TON-57.

## Migration Plan

No schema change. The new mutations and record are additive. The bootstrap stops including trashed containers and their lists' memberships: clients see active content only, which is the intended model.
