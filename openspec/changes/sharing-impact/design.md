# Design

## Context

- **Access** (TON-64) walks down from accepted grants and live links over active containers. Trash suspends sharing; recovery resumes grants that are still accepted or pending (TON-67).
- **The owner's client** holds their containers, but not grants or links. The share dialog reads one container's at a time (`GET /v1/containers/{id}/sharing`).
- **Moves:**
  - Move to… (`MoveDialog`) lists destinations as buttons;
  - dragging a folder or list onto the tree moves it on drop (`drag.tsx`), with an overlay showing its name.
- **Recovery** goes through `RecoveryProvider.proceed()`:
  - it prompts for a destination or a name when needed;
  - an album unit returns to its active lists;
  - Undo after a deletion recovers with `deleted` set.

## Goals / Non-Goals

**Goals:**
- the impact rules;
- one read for previews;
- the block in the move dialog, drag hover and recovery.

**Non-Goals:**
- **MCP's move and recovery tools (M9):** they'll report the same impact.
- **Sharing effects in delete confirmations** (DS-28): not asked for here.
- **Album memberships added or removed in lists:** they are not moves.

## Decisions

### 1. The rules are pure, and computed on the server

**`packages/domain/src/sharing-impact.ts`** reads an `ImpactState`: the owner's containers (parents, names, Trash) and their audiences, which are pending and accepted grants and live links.

**Functions:**
- **`moveImpact(state, id, to)`:**
  - *before* = audiences on the item's current ancestors; *after* = audiences on `to` and its ancestors; *own* = audiences on the item itself.
  - `added` = after − before − own; `removed` = before − after − own, each with the folder it came through.
  - `direct` = audiences on the item and its active descendants.
- **`recoveryImpact(state, ids, to)`:** `added` = audiences on `to`'s chain, less those on the recovered root; `direct` = audiences on the unit's containers; nothing removed, since Trash showed it to nobody.
- **`listsImpact(state, listIds)`:** for an album, `added` = audiences on each list's chain.

**People** are keyed by account, so a person reached through several folders is one audience; **links** by their container.

**Why the server:** it knows Trash units, album memberships, and other people's names, and M9's MCP will reuse it. Previews are reads of one owner's rows, small enough to answer per hover.

### 2. The read

**`GET /v1/sharing/impact`:**
- **`?move={id}&to={folderId|root}`:** the item must be the owner's active folder or list; `to` an active folder of theirs, not inside the item.
- **`?recover={unitId}[&to=…]`:**
  - **`to`** defaults to where the unit was, else the root;
  - **for an album**, `to` is ignored.
- **Anything else:** 404 or 422.

**The answer:** `{added, removed, direct}`, audiences as:
- `{kind: "person", id, name, pending, via: {id, name}}`;
- `{kind: "link", via: {id, name}}`.

### 3. The block

**`features/sharing/sharing-impact.tsx`:**
- **`useSharingImpact(query)`** reads it, keeping answers for the session's last few queries so hovering back is instant, and aborting a read that's no longer wanted.
- **`SharingImpact`** draws a compact block, an `output` so changes are announced:
  - **Lines:**
    - "Newly visible to Anna, Ben (invited) and anyone with the link to 'Metal'";
    - "No longer visible through 'Metal': Anna";
    - "Still shared directly with …";
    - "Sharing unchanged" when nothing is added or removed.
  - **While reading:** "Checking sharing…".
  - **When it can't be read:** "Sharing effects couldn't be checked."

### 4. Where it shows

- **Move to…:** the block sits under the destinations, for the one with the focus, else the pointer.
- **Drag:** the drag context tracks the folder a dragged folder or list is over. The overlay draws the block under the name.
- **Recovery:** `proceed()`, once it has a destination and a name, reads the impact for folder, list and album units, unless the recovery is an Undo (`deleted` set).
  - **When the recovery would make content visible to anyone** (`added` or `direct` not empty), or the read fails, it asks:
    - "Restore '{name}'?" with the block, and Restore or Cancel;
    - Restore sends the recovery.
  - **Otherwise** it recovers at once.
  - **The destination prompt** shows the block for the focused destination.

## Risks / Trade-offs

- **[A read per hover]** → Answers are cached per query, and drag hovers are read after the pointer rests 150 ms on a folder.
- **[Offline]** → Moves wait while offline already. A recovery whose impact can't be read still asks, saying so, rather than restoring unseen.

## Migration Plan

None.
