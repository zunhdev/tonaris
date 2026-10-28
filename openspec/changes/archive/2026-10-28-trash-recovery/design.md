# Design

## Context

- **`trash.recover`** (TON-55) already answers `needs_input` for a destination or a name, and returns only active albums' entries.
- **Units** keep `tombstones` for albums purged while they referred to them (TS-13). Purging arrives with TON-58, which writes them.
- **Clients hold every active folder,** so they can tell whether a parent is active and a name free. They didn't know a unit's original parent until now.
- **A `needs_input` outcome** stays in Activity until dealt with (`writer.ts`). Asking before sending keeps the usual path out of it.

## Goals / Non-Goals

**Goals:** the skip report, the prompts, and AC-27.

**Non-Goals:**
- the Trash view and its Restore (TON-59), which will call the same flow;
- album restore (TON-57);
- SharingImpact in the prompts (M7).

## Decisions

### 1. The skip report

- **The result:** `{skipped: SkippedEntry[]}`, with `SkippedEntry = {albumId, title, artist, listId | null, reason: "album_in_trash" | "album_deleted"}`.
- **Album in Trash:** each entry of a recovered list whose album is in Trash, with its list.
- **Album deleted:** each tombstone, without a list; a tombstone names only the album.

### 2. The unit's former parent

`TrashUnit.parentId` is the root's `parent_id`, which a trashed container keeps, or null. It is additive in responses.

### 3. The flow (`useRecover()`)

- **`RecoveryProvider`** sits above the shell, so Undo, shortcuts and later the Trash view share it.
- **Starting:** `recover(target)` takes `{unitId, rootId, kind, name, parentId, deleted?}` and checks the destination first:
  - with no destination chosen, the original parent;
  - if that is not an active folder of the client's, the **destination** prompt.
- **Then the name:** if it is taken among the destination's siblings, the **name** prompt.
- **Then it sends** `trash.recover` with the choices made, and only those.
- **Optimism:** with `deleted` (Undo), the rows come back at once, the root as chosen; otherwise they arrive from the server.
- **After confirming:** it reads the outcome's result from the save states and shows the notice. "Details" opens the report.
- **A server `needs_input`** (something changed meanwhile) rolls the optimistic rows back and stays in Activity, like any write needing a choice.

### 4. Renaming in Trash

`recoverUnit` moves and renames the root before clearing the Trash marks. The partial unique index covers active siblings only, so the old name never collides.

### 5. The words

- **Destination:**
  - title "Restore 'Doom'";
  - "'Metal' is in Trash or no longer exists. Choose where to restore 'Doom'.", with "Its folder" when the parent's name is unknown;
  - "Collection" first, then the folders, nested.
- **Name:**
  - title "Restore 'Doom'";
  - "'Collection' already has a list or folder named 'Doom'.";
  - the field "Name";
  - "Choose another location…";
  - refusals in `containerNameProblem` and `nameTakenProblem`'s words.
- **Notices:** "Restored 'Doom'", and "Restored · 2 memberships skipped" with **Details**.
- **The report:**
  - title "Skipped while restoring 'Doom'";
  - "These albums weren't put back in their lists. Everything else was restored.";
  - each "{title} · {artist}", with "The album is in Trash" or "The album was deleted permanently", and "· was in '{list}'";
  - **Done**.

## Risks / Trade-offs

- **[Client-side checks]** → The client may be behind the server. The server re-checks, and a mismatch shows as a write needing a choice; nothing changes wrongly.

## Migration Plan

No schema change. The result and `parentId` are additive in responses.
