# Design

## Context

- **Manual order today** (TON-35) shows DS-44's fallbacks:
  - `addedOrder()` and `newestFirst()` in `views.tsx` give a list's and Unsorted's albums;
  - `sortContainers()` in `order.ts` gives creation order for folders, the root and the tree.
- **The `positions` table** exists since the base tables (TS-11): `person_id`, `view_key`, `item_id` and `key`. Its primary key is all three, and keys compare bytewise.
- **TS-16** stores manual order as Rocicorp's `fractional-indexing` keys: one row per moved item, and unkeyed items after keyed ones by `added_at`.
- **TS-21:** a position change carries the old key.
- **Preferences already sync** through `view.set` and `defaults.set` (TON-35): commands with CAS, change-log entities, bootstrap fields, and client collections in `client/sync/views.ts`.
- **`container.move` exists** since TON-26, with cycle, depth, destination and name checks. The client's container collection turns a `parentId` update into it.
- **DS-20 names `@dnd-kit/core`** for drag and drop.
- **The views** are virtualized ARIA grids (TON-34) with roving focus kept by row index (`useGridFocus`). Their keys come from `grid-keys.ts`, which ignores ⌥.
- **Decided with the creator on 23 October 2026:** drag handles show now, on hover and focus under Manual sort, and TON-37 shows them only in Editing mode.

## Goals / Non-Goals

**Goals:**
- **One write per move** once a view is arranged. Concurrent moves of different items never conflict; the same item's do (FR-09.4).
- **DS-51's placement** kept by the server, the same for every client and for MCP later.
- **Moves of folders and lists** from the tree and the views, by keyboard and pointer.

**Non-Goals:**
- **Selection and Editing mode** (TON-37). Keys act on the focused item, and handles show in Viewing mode until then.
- **"Move to position…"** waits for the command palette (TON-63).
- **Adding albums to lists, `L`, and dragging albums onto lists** (FR-01.6) are not moves of containers, so they wait for their issue.
- **Sharing previews and confirmations on moves** (DS-69, M7).
- **Viewers' and guests' arrangements** (M7). Placement writes only the owner's positions.
- **Rearranging in the tree itself.** The tree follows the views' order, and dropping on it moves.

## Decisions

### 1. Positions in the domain

`packages/domain/src/positions.ts` holds:
- **`positionSchema`:** `{ viewKey, itemId, key }`;
- **`positionKey(viewKey, itemId)`:** `<viewKey>:<itemId>`, the change-log and client key;
- **the `order.set` command.**

**`order.set`** (`args: { viewKey, keys: { [itemId]: key | null } }`, `base: { [itemId]: key | null }`):
- **Fields are item IDs.** The same base rules as `album.update` (TS-21) apply: `base` names exactly the items in `args`, null for an item with no key. A mismatch is a `conflict` per item.
- **One move is one mutation,** with every key it writes. A whole move is one dependent change, keys written to place it included (decision 5).
- **Checks:**
  - the view is the person's: the root, Unsorted, or a folder or list they own. This is the same check as `view.set`, now shared as `viewKindOf()`;
  - every item is in that view now: a list's albums, Unsorted's albums, or a folder's or the root's active children. Otherwise the change is refused as `not_found`, since the view changed meanwhile;
  - keys are valid fractional-index keys. `generateKeyBetween(key, null)` must accept each;
  - at most 5,000 items, the most a view can hold (`maxOrderItems`).
- **The result:** each key is upserted, or deleted when null. Each is logged as `entity: "position"`, keyed by `positionKey`. Unchanged items are skipped.

*Alternative:* one mutation per item. A first move in an unarranged view writes several keys, and one mutation makes them one dependent change, applied or refused together.

*Alternative:* writing `order.set` for every item at the first move. A list of 5,000 would write 5,000 rows to move one album.

### 2. DS-51's placement, in the commands

The owner's positions change with the collection, inside the same command, logged with it:

| Command | Placement |
| --- | --- |
| `album.create` | It enters Unsorted: a key before the owner's first Unsorted key. |
| `membership.add`, a new entry | If the album was in no active list, its Unsorted position is deleted. |
| `membership.remove` | Its position in that list is deleted. If it is now in no active list, it gets a key at the top of Unsorted. |
| `container.move` | Its position in the old parent's view is deleted, so it is unkeyed and last in the new one. |

**New items in lists, folders and the root** are unkeyed, so they sort after the arranged ones: the end.

**The store gains:**
- `findPositions(personId, viewKey, itemIds)`;
- `savePosition`;
- `deletePosition`;
- `firstKey(personId, viewKey)`: `ORDER BY key COLLATE "C"`;
- `viewItems(personId, viewKey)`;
- `inActiveList(albumId)`.

*Alternative:* the client places items. Every client, and MCP, would have to repeat it, and a session that never opens Unsorted would never place anything.

### 3. Manual order on the client

`order.ts` gains `arranged(items, keys, idOf)`: items with keys by key, bytewise, ties by ID, then the rest in the order given (DS-44's fallback):
- **a list's albums:** the order added;
- **Unsorted's albums:** newest first;
- **folders and lists:** creation order.

`sortAlbums` and `sortContainers` take the view's keys for Manual. The tree passes each folder's keys, so it follows each level's arrangement.

### 4. The client's positions collection and `arrange()`

- **The collection.** `client/sync/positions.ts` is a snapshot collection of positions, keyed by `positionKey`.
- **`arrange(viewKey, keys)` writes one move.**
  - It runs one TanStack DB transaction (`createTransaction`) that inserts, updates or deletes the rows. Its mutation function sends them as one `order.set`, whose base is each row's value before it.
  - The rows show at once, and roll back on refusal or conflict.
  - Its save-state key is `order:<viewKey>`, so no row's marker shows it, and Activity names it "Arrange 'Doom'".
- **The sync client exposes `arrange`,** for the views and for Retry.
- **Retries, dependencies and descriptions:**
  - `resubmit.ts` makes an `order.set` again against the current keys;
  - `dependencies.ts` makes it depend on the creation of its view or items in the same batch;
  - `describe.ts` names it.

  The conflict review labels each item by its title or name, with "Placed elsewhere", "Your place" and "Not arranged" as values.

### 5. Planning a move

`planMove(sequence, keys, itemId, place)` is pure, in `order.ts`. `place` is `{ before: id }`, `{ after: id }`, `"top"` or `"bottom"`. It answers the keys to write.

- **The sequence** is the view's manual order without the item: arranged items, then unkeyed ones.
- **Among arranged items,** it is one key, `generateKeyBetween(previous, next)`. A next item that has no key counts as none.
- **Past the arranged ones,** the unkeyed items up to the target get keys first, in order (`generateNKeysBetween`), then the item. Bottom in an unarranged view therefore writes every key once; later moves write one.
- **Equal keys,** from two sessions placing items in one gap at once, are skipped over to the next greater key, so a key is always valid. The item may land after the tied ones.
- **Grouped,** "up by one" places the item before the previous item of its group in the full sequence, and top and bottom before the group's first or after its last. The one arrangement serves every grouping (FR-05.8).

### 6. Keyboard rearranging

- **The keys.** In album rows, cards and folder rows, ⌥↑ and ⌥↓ move the focused item by one, and ⌥⇧↑ and ⌥⇧↓ to the group's or view's top or bottom.
- **Focus follows the item.** `useGridFocus` gains `focusRow(row)`, which the view calls with the item's new row.
- **The announcement** goes through the polite region (DS-83): "Moved {name} to position {n} of {total}", counted within the group when grouped.
- **Under another sort,** nothing moves. A toast says "Rearranging works in manual order", with "Switch to manual order" (DS-108's info toast).

### 7. Dragging

- **One `DndContext`** wraps the workspace (`features/collection/drag.tsx`), so a drag can start in a view and end on the tree. It uses `PointerSensor` with a 6 px activation distance, so clicks and links still work, and dnd-kit's auto-scroll.
- **What can be dragged:**
  - **Rows** carry a drag handle under Manual sort, shown on the row's hover or keyboard focus (DS-21's column; TON-37 moves it into Editing). Album rows and folder rows rearrange.
  - **Folder rows and tree items** can also be dragged onto the tree, to move.
- **The drop indicator.** Over a row, the dragged item's centre against the row's middle chooses before or after. A 2 px `accent.solid` line marks the place. A `DragOverlay` shows the item's name, since its row may scroll out and unmount.
- **Tree targets.** Folders and Collection are droppable for folders and lists, and highlight with `accent.soft` (DS-27). Invalid destinations are not droppable: the item itself, its descendants, lists, and while offline. The domain still checks names and depth.
- **A drop on a row** calls `planMove` and `arrange`. A drop on the tree updates the container's `parentId`, which sends `container.move`.
- **Cards** have no handle. They are rearranged by keyboard.

### 8. Moving with M

- **`M` joins the shortcut matcher as `move`.** It acts on, in order:
  1. the focused tree item;
  2. the focused folder or list row in a view;
  3. the folder or list the view shows.
- **"Move {name} to…"** is a Base UI dialog listing Collection and the owner's folders, indented by level.
  - It excludes the item, its descendants and its current parent.
  - ↑ and ↓ move between choices, and Enter moves.
- **After a move,** the destination is expanded in the tree, and "Moved {name} to {destination}" is announced. The moved item follows the destination's arranged items, in creation order among the rest. Placing it strictly last would mean writing a key for every unarranged sibling, and DS-51 asks for the end only for albums added to lists.
- **While offline,** `M` does nothing and the tree takes no drops (DS-81), as N does.

## Risks / Trade-offs

- **[Large first moves]** → Moving to the bottom of an unarranged 5,000-album view writes 5,000 keys in one mutation, about 350 KB. It happens once per view, and later moves write one key.
- **[Equal keys from a race]** → Two sessions placing different items into the same gap can produce equal keys. Their order then falls back to ID, and the next move into that gap skips past them. Nothing is lost.
- **[Handles in Viewing mode until TON-37]** → This was the creator's choice. TON-37 gates them.
- **[Placement writes a position for every new album]** → Albums in Unsorted carry a key each, so the bootstrap grows by one small row per Unsorted album.
- **[dnd-kit and virtualization]** → Rows that scroll out unmount, with their droppables. The overlay and auto-scroll keep the drag going, and only rows in view can be targets, which is what a person can see.

## Migration Plan

- **No migration,** since `positions` exists.
- **Albums already in Unsorted** stay unkeyed. They follow the arranged ones, newest first, until someone arranges them.
- **Rollback:** the old web app can't parse `position` changes, so a mixed deploy reconnects old tabs until reloaded, as with TON-35. The web app and the API deploy together.

## Open Questions

None.
