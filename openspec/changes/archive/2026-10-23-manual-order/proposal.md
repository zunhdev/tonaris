# Proposal

Linear: TON-36 (Feature). Implements FR-05.2–FR-05.4, personal arrangement in every view (the root and Unsorted included), and the interface for FR-01.4–FR-01.5's moves of folders and lists. Design: DS-49 (rearranging and moving), DS-51 (where new items go), with DS-21's drag handle, DS-27's drop targets and DS-83's announcements. Tech: TS-16 (fractional-index positions), TS-21 (a position change carries the old key). Verifies AC-17, and FR-09.4 for concurrent rearranging.

## Why

TON-35 lets a person choose Manual order, but nobody can arrange anything: Manual shows DS-44's fallbacks only. Lists used as rankings, an inbox-like Unsorted and a hand-ordered tree all need personal positions (FR-05.2). Folders and lists can be moved by the API since TON-26, but not yet from the interface (FR-01.4, FR-01.5).

## What Changes

- **Personal positions** (TS-16): each person's arrangement of each view is stored as fractional-index keys, one per moved item, saved to the account and synced (FR-05.2, FR-11.8).
  - **A new command, `order.set`**, sets or clears the keys of some items in one view. It carries the old keys, so arranging the same item from two sessions is a conflict for review, and arranging different items both apply (FR-09.4).
  - **The bootstrap and the stream** carry positions.
- **Manual order** is the arrangement: arranged items by their keys, then the rest in DS-44's fallback order.
- **Where new items go** (DS-51), kept by the server:
  - **An album entering Unsorted,** new or leaving its last list, goes to the top of the owner's Unsorted arrangement.
  - **Its Unsorted place is not kept** when it joins a list and later returns.
  - **A new album in a list** goes at the end. So does a new folder or list in a folder, or the root. One moved there follows the arranged items, in creation order among the rest.
  - **An album removed from a list** loses its place there, so adding it again puts it at the end.
- **Rearranging on desktop** (DS-49), only under Manual sort:
  - **Keyboard:** ⌥↑ and ⌥↓ move the focused item by one; ⌥⇧↑ and ⌥⇧↓ to the top or bottom.
  - **Pointer:** a drag handle appears on a row's hover or focus under Manual sort (DS-21). Dropping between rows places the item there.
    - Decided with the creator on 23 October 2026: handles show now, and TON-37 shows them only in Editing mode, as DS-45 says.
    - Cards are rearranged by keyboard. The handle is a row column.
  - **Each move is announced:** "Moved {name} to position {n} of {total}" (DS-83).
  - **Under another sort,** ⌥↑ or ⌥↓ shows a hint, "Rearranging works in manual order", with the action "Switch to manual order".
  - **Grouped,** an item moves among its own group's items, in the one arrangement (FR-05.8).
- **Moving folders and lists** (FR-01.4, FR-01.5, DS-49):
  - **`M`, "Move to…"**, opens a picker of the root and the owner's folders, for the focused folder or list in the tree or a view. It excludes the item itself, its descendants and its current parent.
  - **Dragging** a folder or list from the tree or a view onto a folder in the tree, or onto Collection, moves it. Drop targets highlight with `accent.soft` (DS-27).
  - **The moved item leaves its place** in the old parent's arrangement, and follows the arranged items in its new one. The move is announced.
  - **Moves are collection edits.** They wait while offline, with "You're offline" (DS-81). Refusals report as any write does (DS-107).
- **Rearranging is presentation only** (AC-17): it never creates memberships, moves containers, or changes access.
- **Docs:**
  - DS-21, DS-44, DS-49, DS-51 and DS-78 as built;
  - TS-16 and TS-11's `positions`;
  - the protocol's `order.set` and `position` changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`:
  - **Changed:** manual order is now the person's arrangement, with DS-51's placement for new items.
  - **Added:** rearranging by keyboard and pointer, conflicts between sessions, and rearranging being presentation only (AC-17).
- `collection-hierarchy`: owners move folders and lists with `M` or by dragging onto the tree.
- `app-shell`: "Keyboard shortcuts move around the workspace" gains `M`, and ⌥↑/⌥↓ for rearranging.

## Impact

- **Domain** (`packages/domain`):
  - `positions.ts`: the position record, its key, and the `order.set` command;
  - the placement side effects in `album.create`, `membership.add`, `membership.remove` and `container.move`;
  - the new dependency `fractional-indexing` (Rocicorp), as TS-16 names it.
- **Database:** the store's position methods and the bootstrap. The `positions` table exists since the base tables, so there is no migration.
- **API:** no new routes. The OpenAPI document is regenerated.
- **Web client:**
  - a `positions` collection;
  - `arrange()`, which writes one `order.set` for a whole move;
  - retries, dependencies and descriptions for it.
- **Web app:**
  - manual order from positions;
  - keyboard and pointer rearranging in rows and cards, with `@dnd-kit/core` as DS-20 names it;
  - the move picker, tree drop targets, and the shortcuts and their reference.
- **E2E:** new accounts and `e2e/manual-order.e2e.ts`.
