# Proposal

Linear: TON-57 (Feature). Implements:
- FR-14.1, deleting an album from the collection, confirmed (X-07);
- FR-14.2, restoring it to its still-active lists, or to Unsorted;
- FR-14.3, the same-album conflict that pauses a restore.

Design: DS-50 (deletion feedback), DS-56 (the same-album dialog). Done when AC-29 passes; its UI path to restore arrives with the Trash view (TON-59).

## Why

Albums can only reach Trash through MCP's approval flow, and clients aren't told when they do. Nothing restores them. AC-29 asks that:
- deletion moves an album to 30-day Trash;
- restore brings back its active-list memberships;
- a same-album conflict pauses with both records unchanged.

## What Changes

- **`album.delete {id, unitId}`** moves an album to Trash as its own unit, with the client's ID.
  - It leaves every list and Unsorted, and its places go.
  - Its information, links, field values and entries stay.
- **`trash.recover` restores album units:**
  - entries in active lists come back;
  - entries in trashed lists are reported (`list_in_trash`, with the list's name);
  - with none left, the album enters Unsorted at its top.
- **Same-album conflict:** an active album of the same release group pauses the restore as `needs_input` `match`, naming it; nothing changes.
- **Re-addition through capture** (TON-44) now sends the album back to clients, and its unit's removal.
- **Clients hold active albums only:**
  - the bootstrap leaves out trashed albums and their entries;
  - deletion sends the album's removal, and restore its return.
- **The web:**
  - **⌘⌫** on the inspector's or focused album, and **Delete from collection…** at the foot of the inspector in Editing mode, open the confirmation: "Delete 'Bleach' from your collection?", the lists it leaves, "Removes it from every list and Unsorted." and "Recoverable from Trash for 30 days.";
  - **the recovery flow restores albums.** A same-album pause shows both records, with **Keep the active album**, **Delete the active album, then restore…** (confirmed) and **Cancel**.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `trash-and-recovery`: gains album deletion and restore.

## Impact

- **`packages/domain`:**
  - `album.delete`;
  - album units in `trash.recover`;
  - capture's reactivation changes;
  - the store's album Trash methods.
- **`packages/db`:** the methods, and active-only albums in the bootstrap.
- **`apps/api`:** the regenerated OpenAPI document; requests only gain `album.delete`.
- **`apps/web`:**
  - the client's `deleteAlbum`;
  - ⌘⌫, the inspector button, the confirmation;
  - the same-album dialog;
  - descriptions, retries and dependencies.
- **No schema change.**
