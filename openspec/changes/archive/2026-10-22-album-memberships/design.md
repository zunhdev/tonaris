# Design

## Context

- **The pipeline and its pattern exist.** `executeMutation` (`packages/db/src/sync.ts`) runs `runCommand` on a `CollectionStore` bound to the owner's write transaction, logs each change at the next `seq`, and stores the outcome. TON-26 added container commands this way; this change follows them.
- **The `memberships` table exists** (TS-11): PK `(list_id, album_id)`, `owner_id`, `added_at`. Foreign keys cascade only on purge, and rows survive trashing either side (TS-13). The bootstrap already reads it, and the web client holds entries in a read-only collection keyed `<listId>:<albumId>`.
- **The only writer today** is the MCP stand-in `addToList` (`packages/db/src/mcp.ts`, TON-23). It inserts rows without logging them.
- **Unsorted is already counted** that way: `collectionOverview` counts active albums with no entry in an active list, for `get_overview`.
- **Required information is already enforced.** `albumProblem` (FR-02.6) runs on `album.create` and on `album.update`'s resulting record, and the table's CHECKs back it.
- **Nothing is deployed** yet, and no command ever wrote `edition_label` or `barcode`. Only the workload generator fills them.

## Goals / Non-Goals

**Goals:**
- Entry rules in one domain module, shared by HTTP now and MCP in M9, and testable against the in-memory store.
- Unsorted that needs no maintenance: no write ever marks an album as unsorted.

**Non-Goals:**
- **Trashing and recovering lists and albums** (TON-55, M5). Entry rows already survive trashing; this change only refuses entries for trashed sides and reads Trash as "not in effect".
- **Album capacity** (5,000, TON-60). Only the entry limit lands here.
- **Adding to several lists or albums at once.** That is a batch of these mutations (TS-25, TON-28). An album created into a list is `album.create` followed by `membership.add`; the outbox sends them in order (TS-22).
- **Moving MCP's `add_to_list` onto these commands** (M9, after batches).
- **Manual order and where an album lands** (DS-51, TON-36), and the Unsorted view (TON-33, TON-34).
- **Refusing edits to trashed albums.** `album.update` doesn't check Trash yet; M5 adds that with recovery.

## Decisions

### 1. Two set-like mutations, without `base`

- `membership.add {listId, albumId}` and `membership.remove {listId, albumId}` carry no `base`.
- An entry has no editable fields, only whether it exists, so there is no stale view to compare. Adding what is there confirms as already in the list (FR-01.7). Removing what isn't there confirms with no change, and uses no `seq`.
- *Alternative:* one `membership.set {listId, albumId, present}` with `base {present}`. That would turn two sessions adding the same album into a conflict, which FR-01.7 answers as "already in the list".

### 2. Order of checks

Both commands run the same checks, in this order, so each rejection has one reason:

1. **The list.** Missing is `not_found`. Then authorization against its owner (`authorizeWrite`, scope `collection`), so another person's list or a read-only connection is `permission_denied`. A folder is `invalid_destination`. A list in Trash is `trashed`.
2. **The album.** Missing, or another person's, is `not_found`. That answers the same for both, so nobody can probe for other people's albums. In Trash is `trashed`.
3. **The entry.**
   - For an add: an existing entry confirms with `alreadyInList: true`. Otherwise the limit is checked: 50,000 entries, Trash included.
   - For a remove: an absent entry confirms with no change.

The limit is checked after the existing entry, so re-adding at the limit still confirms.

### 3. A command may return a result

- `CommandResult`'s `applied` gains an optional `result`, and `executeMutation` stores it in the `confirmed` outcome (`result: null` when absent, as now).
- `membership.add` always returns `{alreadyInList: boolean}`. The schema is exported as `membershipAddResultSchema`, so clients parse the outcome's `result` with it.
- A replay returns the stored outcome. A retried add whose first attempt applied therefore still reports `alreadyInList: false`, which is what the person did.

### 4. The entry change and its key

- The change log gets `entity: "membership"`, with `id` set to `<listId>:<albumId>` (`membershipKey`).
  - `data` is the entry `{listId, albumId, addedAt}` on insert.
  - It is null on delete, as for every entity; the key alone identifies the entry.
- `change_log.entity_id` is already text for keys like this (TS-11). The web client already keys its entry collection the same way.
- *Alternative:* a surrogate UUID per entry. It would need a column and a client-chosen ID, only to name a row the pair already names.

### 5. `addedAt` comes from the server's clock

- The command takes `now` from `CommandContext`. `executeMutation` passes the `now` it already has, and tests pass a fixed one.
- `addedAt` orders entries that have no manual position (TS-16), so it must be one clock for all of the owner's sessions.
- A client's optimistic entry uses its own time until the change arrives.

### 6. The store

`CollectionStore` gains:

- `findMembership(listId, albumId)`;
- `countMemberships(ownerId)`: every row of the owner, Trash included;
- `insertMembership(entry & {ownerId})` and `deleteMembership(listId, albumId)`.

`StoredAlbum` gains `trashed`, as `StoredContainer` has, so the commands can refuse albums in Trash. `album.create`'s idempotent comparison stays on the album's fields.

### 7. Unsorted stays a query

- Unsorted is "active albums with no entry in an active list" (TS-13), computed where it is shown:
  - `collectionOverview`'s count in SQL;
  - the client's views from the bootstrap's entries (TON-33, TON-34).
- No command writes anything for Unsorted, so a list going to Trash moves its albums there without touching them (FR-01.10).
- The tests check it through the count and search the server already has: `collectionOverview` and `searchAlbums`.

### 8. Dropping the edition columns in one migration

- drizzle-kit generates a migration that drops `albums.edition_label` and `albums.barcode`.
- TS-17 asks for expand/contract, so a deploy never breaks the running version. Nothing runs yet, and no released code reads or writes these columns, so the drop needs no separate contract step.
- The workload generator also drops its `reissue` records, other editions saved as separate albums. Under FR-02.12 they would be duplicates that matching prevents. The TS-120 shape (5,000 albums, about 1.8 entries each) is unchanged.

## Risks / Trade-offs

- **A web tab open since before this deploy** ignores entry changes until it reloads, as it did containers before TON-26. → Acceptable: TON-30 replaces the client store.
- **The MCP stand-in bypasses the limit and the log.** → It is used only in the G3 test clients until M9 replaces it, and the limit is far above what they add.
- **Counting entries on every add.** `count(*)` over the owner's rows uses the `owner_id` index, and is bounded by 50,000, under a lock only this account's writes take. → Acceptable at this scale; a counter column can come later if measurements ask for it.

## Migration Plan

- One migration drops the two columns. Rolling back restores them empty; no command ever wrote them.
- Deploying adds mutation names and a change entity, and rolling back removes them.
- Entries added meanwhile remain valid rows, which the previous version shows read-only.
