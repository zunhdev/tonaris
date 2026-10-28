# Proposal

Linear: TON-58 (Feature). Implements:
- FR-01.17, retention and expiry after 30 days;
- FR-01.18, early permanent removal, confirmed and app-only;
- FR-14.5, albums expiring individually and freeing their slots.

Tech: TS-13 (purge and tombstones), TS-91 (the hourly job). Design DS-57's dialogs belong to the Trash view (TON-59), which shows the units they act on. Done when AC-31 passes, with TON-59 for its interface.

## Why

Trash keeps units with an expiry (TON-55, TON-57), but nothing removes them: they stay forever, still counted, and an owner can't clear them early. Recovery's skip report expects tombstones that nothing writes yet.

## What Changes

- **Purging a unit** (TS-13):
  - **a folder's or list's:** deletes its folders and lists, their entries cascading. Albums stay in their other lists or Unsorted. An album in Trash that was in one of the lists gets a tombstone of the list in its own unit;
  - **an album's:** deletes the album, its entries, links, field values and provenance cascading, and its places. Every unit still referring to it gets a tombstone of the album;
  - **for clients:** the `trashUnit` delete, plus `link` and `fieldValue` deletes for a purged album's, which clients hold.
- **`trash.purge {unitIds}`:**
  - early removal of units the owner confirmed, or all of them for Empty Trash;
  - app-only (`trash_purge` scope, X-03);
  - its result `{purged, gone}` reports units already gone, and the rest still go.
- **The hourly `trash-expiry` schedule** purges units past `expires_at`:
  - each owner's in a transaction under their write lock, logged without a mutation;
  - published to their streams after committing.
- **Recovery reports purged lists:** an album's restore now reports `list_deleted` from its tombstones, beside `list_in_trash`.
- **The web client** gains `trash.purge(unitIds)`, with descriptions, retries and dependencies. The dialogs come with the Trash view.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trash-and-recovery`: gains expiry and permanent removal.

## Impact

- **`packages/domain`:**
  - `purgeUnit` and `trash.purge`;
  - the tombstone union;
  - the store's purge methods.
- **`packages/db`:**
  - the methods;
  - `purgeExpiredTrash`;
  - the `Tombstone` column type.
- **`apps/api`:**
  - the `trash-expiry` schedule, given the hub;
  - the regenerated OpenAPI document, whose requests only gain `trash.purge`.
- **`apps/web`:** the client's purge, descriptions, retries and dependencies.
- **No schema change:** `tombstones` is jsonb.
