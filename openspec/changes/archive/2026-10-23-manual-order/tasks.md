# Tasks

## 1. Domain and protocol

- [x] 1.1 Add `fractional-indexing` to `packages/domain`, and `positions.ts`: `positionSchema`, `positionKey`, `maxOrderItems` and the `order.set` command with CAS (design decision 1). Share the view check as `viewKindOf()` with `view.set`. Add the store's position methods, the `order.set` envelope, the `position` change and the bootstrap's `positions`. Verify with `positions.test.ts`:
  - keys set and cleared, logged as `position` changes;
  - a stale key as a conflict per item (spec: the same item);
  - different items both applying (spec: different items);
  - an item not in the view refused;
  - invalid keys refused;
  - another person's list refused;
  - nothing changed for the same keys.
- [x] 1.2 Add DS-51's placement to `album.create`, `membership.add`, `membership.remove` and `container.move` (design decision 2). Verify with the placement tests in `positions.test.ts`, and `album.create`'s in `commands.test.ts`:
  - a new album at the top of Unsorted;
  - an album joining a list losing its Unsorted key;
  - an album leaving its last list at the top of Unsorted, and leaving a list losing its key there;
  - a moved container losing its key in the old parent

  (specs: Unsorted is an inbox; a list as a ranking).

## 2. Storage and API

- [x] 2.1 Implement the store's position methods and the bootstrap's `positions` in `packages/db/src/sync.ts`. Verify with `packages/db/src/sync.test.ts`: `order.set` logged and bootstrapped; `firstKey` bytewise; placement through the real queries; Unsorted's items excluding albums in lists.
- [x] 2.2 Regenerate the OpenAPI document, and add an API test: an `order.set` reaching the other session's stream, and a stale one a conflict. Update `docs/api/sync-protocol.md` and TS-11 and TS-16 in `docs/tech-spec.md`. Verify with `bun run openapi:check` and `bun test apps/api`.

## 3. Client sync

- [x] 3.1 Add the `positions` collection and `arrange()` to the sync client (design decision 4). Verify with `client/sync/sync.test.ts`:
  - one move sending one `order.set` with its bases;
  - a change from elsewhere reaching the collection;
  - a conflicting move rolled back.
- [x] 3.2 Teach `resubmit.ts`, `dependencies.ts` and `describe.ts` about `order.set`, including the conflict review's labels and values. Verify with `dependencies.test.ts`, `describe.test.ts` and a Retry case in `sync.test.ts`.

## 4. Order rules

- [x] 4.1 Add `arranged()` and `planMove()` to `order.ts`, and make Manual in `sortAlbums` and `sortContainers` use the keys (design decisions 3 and 5). Verify with `order.test.ts`:
  - arranged items first by key, then the fallback;
  - one key between arranged items;
  - keys for the unkeyed prefix when moving past them;
  - top and bottom;
  - equal keys skipped;
  - before and after within a group.

## 5. Interface

- [x] 5.1 Add `@dnd-kit/core` to the web app. Use the keys in the views and the tree, and add `focusRow` to `useGridFocus`. Build keyboard rearranging, with its announcement and the hint under another sort (design decision 6). Verify with the browser tests in group 6.
- [x] 5.2 Build dragging: the workspace's drag context, row handles under Manual, the drop indicator and overlay, and tree drop targets for moves (design decision 7). Verify with the browser tests in group 6.
- [x] 5.3 Build `M` and the move picker (design decision 8). Add `M` and the rearranging keys to the shortcut matcher and the reference. Verify with `shortcuts.test.ts` and the browser tests in group 6.

## 6. Browser tests

- [x] 6.1 Add e2e accounts and `e2e/manual-order.e2e.ts`, covering the specs in the browser:
  - ⌥↑ with its announcement, ⌥⇧↓, and the order kept after a reload (spec: moving an album up);
  - dragging a row by its handle (spec: dragging a row);
  - the hint under another sort, and switching (spec: rearranging under another sort);
  - an album leaving its last list arriving at the top of Unsorted, and a new album at the end of an arranged list (specs: Unsorted is an inbox; a list as a ranking);
  - rearranging Unsorted adding no list entries, and the root keeping parents while the tree follows (specs: rearranging Unsorted; rearranging the root);
  - M and the picker's choices, and dragging a folder onto Collection (specs: moving with M; moving by dragging onto the tree; the picker offers only valid places);
  - a move from a second browser reaching the first;
  - axe finding nothing in the picker and in a view with handles.

## 7. Specs and integration

- [x] 7.1 Update `docs/design-spec.md` for what is built: DS-21, DS-27, DS-44, DS-49, DS-51 and DS-78, as built in TON-36. Verify the text matches the implementation.
- [x] 7.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 7.3 Run `openspec validate manual-order --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `views-and-ordering`, `collection-hierarchy` and `app-shell`, and that `openspec validate --all --strict` passes.
