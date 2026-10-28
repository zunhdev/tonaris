# Design

## Context

- **Units** hold folders and lists by `trash_unit_id`, or one album, and keep `tombstones` (jsonb) for recovery's reports (TS-13).
- **Foreign keys cascade:**
  - deleting a container removes its memberships;
  - deleting an album removes its memberships, links, provenance and field values.

  Positions refer to items by key without a foreign key.
- **Schedules** run in the API process under an advisory lock (`runExclusively`). Streams are fed by `hub.publish`, not by polling the log, so a job that changes data must publish.

## Goals / Non-Goals

**Goals:** purge semantics, `trash.purge`, the hourly expiry, tombstones both ways, and AC-31's server side.

**Non-Goals:**
- the Trash view and DS-57's dialogs (TON-59);
- capacity counting (TON-60), which only needs the rows gone;
- account deletion (FR-11.11).

## Decisions

### 1. Purging (`purgeUnit`)

- **A folder's or list's unit:** for each entry of its lists whose album is in Trash, the album's unit gets `{kind: "list", id, name}`. Then its containers are deleted, their entries cascading, and the unit row goes.
- **An album's unit:**
  - the folder and list units whose lists hold an entry of the album get `{id, title, artist}`;
  - the album's services and fields are read, for clients;
  - its positions are deleted, then the album, everything else cascading, then the unit.
- **Left as they are:** positions and view preferences keyed by a purged container (as a view). They are dead, small, and keyed by an ID that never returns.
- **Changes:** the `trashUnit` delete, and for an album its `link` and `fieldValue` deletes.

### 2. `trash.purge {unitIds}`

- **Limits:** 1 to 5,000 IDs, de-duplicated.
- **App-only:** `authorizeWrite` with `trash_purge` refuses MCP as `app_only`.
- **Gone units:** a unit missing, or someone else's, counts as gone.
- **Result:** `{purged, gone}`.

### 3. Expiry (`purgeExpiredTrash`, `trash-expiry`)

- **Owners:** `select distinct owner_id from trash_units where expires_at <= now`.
- **Each owner:** a transaction that takes the account's lock, purges their expired units in expiry order, and logs the changes with `mutation_id` null. It answers `{accountId, changes}`.
- **The schedule:** hourly. It publishes each owner's changes after their commit, and its advisory lock keeps instances from overlapping.

### 4. Tombstones in reports

- **The type:** `Tombstone = {kind?: "album", id, title, artist} | {kind: "list", id, name}`. Older album tombstones have no `kind`.
- **A container's recovery** reports album tombstones (`album_deleted`).
- **An album's restore** reports list tombstones (`list_deleted`, with `listName`).

### 5. The web client

- **`client.trash.purge(unitIds)`** removes the units from the collection at once and persists `trash.purge`, keyed by the write.
- **Descriptions:** "Delete 3 items from Trash permanently".
- **Retries and dependencies:** a retry purges those still held, and it references the units.

## Risks / Trade-offs

- **[A large expiry]** → One owner's purge runs in one transaction. Units are bounded by the 2,000-container and 5,000-album limits, so it stays modest.
- **[A failed expiry]** → It is logged and retried at the next hour. Units stay in Trash meanwhile, safe.

## Migration Plan

No schema change. The mutation, schedule and tombstone kinds are additive.
