# Design

## Context

- **Album units exist** (MCP's prototype) and are shown as units since TON-55. `reactivateAlbum` brings one back for capture (TON-44).
- **Clients still receive trashed albums,** unmarked, with their entries.
- **"The same album"** is the same MusicBrainz release group, as capture matching decides (TS-44).

## Goals / Non-Goals

**Goals:** album deletion, restore, the same-album pause, active-only albums on clients, and AC-29's checks short of the Trash view.

**Non-Goals:**
- the Trash view and its Restore (TON-59);
- purge (TON-58);
- MCP's deletion logging changes, which MCP's rebuild in M9 does through commands.

## Decisions

### 1. `album.delete {id, unitId}`

- **Unit:** its own, of kind `album`, expiring in 30 days.
- **Clients:** an `album` delete, a `membership` delete per entry in an active list, and the `trashUnit` insert.
- **Places:** each active list's and, if it was in Unsorted, Unsorted's.
- **Kept:** links and field values are untouched.
- **Already trashed:** `trashed`. A resend changes nothing.

### 2. Album units in `trash.recover`

- **Same-album check first:** `albumsOfReleaseGroup` finds active albums of its release group. With one, the answer is `needs_input` `match`, with `{unitId, albumId, title, artistCredit, originalYear}`.
- **Then the entries:**
  - an active list's come back;
  - a trashed list's are reported `list_in_trash`, with `listName`, as the client doesn't hold that list;
  - with none back, the album gets Unsorted's top.
- **Changes:** the `album` insert (with its artwork, which the API signs), the `membership` inserts, the positions, and the `trashUnit` delete.

### 3. Capture's re-addition

`reactivateAlbum` answers `{left, unitId}`. Capture adds the `trashUnit` delete, and sends the album as an `album` insert with its filled values, since clients didn't hold it.

### 4. Active-only albums

The bootstrap filters `albums.trashed_at`, and entries join an active album as well as an active list. Links and field values of albums in Trash still come; they are small, and Settings counts usage from them.

### 5. The web

- **`client.trash.deleteAlbum(id)`:** removes the album and its entries from the collections and persists `album.delete`.
- **⌘⌫:**
  - a new shortcut, the only one with a modifier;
  - it deletes the inspector's album, else the focused album;
  - it switches to Editing mode and waits while offline.
- **The inspector:** **Delete from collection…** (danger) at its foot in Editing mode.
- **The confirmation (DS-50):**
  - title "Delete 'Bleach' from your collection?";
  - scope "It leaves 2 lists: Doom, Later." or "It leaves Unsorted.";
  - consequences "Removes it from every list and Unsorted." and "Recoverable from Trash for 30 days.";
  - action "Move to Trash";
  - then "'Bleach' moved to Trash", and the inspector closes.
- **The recovery flow:** album units skip the destination and name checks.
  - **A `needs_input` `match`** is taken out of Activity and shows **"Restore 'Bleach'?"**:
    - both records;
    - "'Bleach' is already in your collection as the same album. Restoring would make two records of it, so nothing has changed: both stay as they are.";
    - **Keep the active album** (focused), **Delete the active album, then restore…**, and **Cancel**.
  - **Deleting the active album** confirms first, then deletes it and restores, in that order.

## Risks / Trade-offs

- **[No restore in the interface yet]** → Restore is reachable from the Trash view (TON-59). Until then it is tested through the client and API.

## Migration Plan

No schema change. Clients stop receiving trashed albums, which they have no use for.
