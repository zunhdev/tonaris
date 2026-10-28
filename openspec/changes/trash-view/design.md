# Design

## Context

- **Clients hold units** (`trashUnits`), but not trashed folders, lists or albums, so a folder's contents and an album's artist must come with the unit.
- **Restore** is `useRecover()` (TON-56), and purge is `client.trash.purge()` (TON-58).
- **`ConfirmDialog`** is DS-28's.

## Goals / Non-Goals

**Goals:** DS-55's table, DS-57's dialogs, keyboard operation, and the read-only folder contents.

**Non-Goals:**
- selecting several units at once, which comes with selection (X);
- sharing effects in the dialogs (M7).

## Decisions

### 1. The record

- **`members`:** `[{id, kind, name, parentId}]`, the folders and lists deleted with the root. They nest under the root by `parentId`.
- **`artist`:** an album's credit; null otherwise.

Both are computed where units are made and in the bootstrap.

### 2. The page

- **The table:** a `<table aria-label="Trash">` of units, newest deletion first.
- **The name cell:** a disclosure button for a folder with contents; plain text otherwise.
- **Expiry:** "Expires in N days", or "Expires within a day". It is refreshed each minute, and in `status.warning` under 3 days. The tooltip's trigger takes focus and shows the date and time.
- **"Was in":**
  - "Collection";
  - the active folder's name;
  - "'Metal' (in Trash)" when the folder is a unit's root or member;
  - "A deleted folder" otherwise;
  - "—" for albums.
- **R:** one key handler on the table body restores the unit whose row holds the focus. The row's buttons are the focusable way in.
- **The filter:** narrows by `searchKey` of the name. It is local, not search (FR-12.1).

### 3. The dialogs (DS-57)

- **Delete permanently:**
  - title "Permanently delete 'Bleach'?";
  - scope: for an album, "The album 'Bleach' · Nirvana, with its links and field values" and "Frees 1 album slot."; for a list, "The list 'Doom'"; for a folder, "The folder 'Metal' and the 2 lists inside it". Containers add "Its albums stay in their other lists or in Unsorted.";
  - "This can't be undone.";
  - action "Permanently delete N items".
- **Empty Trash:**
  - title "Empty Trash?";
  - the totals by type;
  - "Albums still in your collection stay; purged albums free their slots." and "This can't be undone.";
  - action "Permanently delete N items".
- **After:** "Deleted 'Bleach' permanently" or "Trash emptied", with "· N items were already gone" when the result says so.

## Risks / Trade-offs

- **[Large folders in the record]** → A unit's members are bounded by the 2,000-container limit, and most units are a single list.

## Migration Plan

No schema change. The record's new fields are additive.
