# Design

## Context

- **The shell today** (`features/shell`):
  - a fixed 240 px sidebar of placeholders, with a `Collection` link and the SyncIndicator in its footer;
  - one workspace view, `/c`, with a page header;
  - `/` redirects to `/c` on the server (`routes/index.tsx`).
- **The client store** (`client/sync`, TON-30) holds TanStack DB collections of albums, containers and memberships, fed by the stream. `@tanstack/react-db`'s `useLiveQuery` already reads them on the perf page (TON-21).
- **The domain** (`containers.ts`, `names.ts`) holds the naming rules:
  - blank names and names over 200 characters are refused;
  - sibling names are unique, case-insensitively;
  - the DS-107 refusal reads "'X' already exists in Metal. Choose another name." (TON-32).
- **TON-31's notes on TON-33** ask the tree's rows to wire in:
  - `SaveStateMarker` with `useSaveState(id)`;
  - `aria-busy` while pending or unconfirmed;
  - `useLiveHighlight(id, ref)`;
  - Edit for a failed rename;
  - edit controls disabled offline.
- **Containers carry no creation time,** but their IDs are client-made UUIDv7s, which sort by creation.

## Goals / Non-Goals

**Goals:**
- The tree and the views can be navigated by keyboard alone.
- The routes match DS-32 for the collection.
- Owners create and rename folders and lists without the test hook.

**Non-Goals:**
- **Moves:** drag, and the M picker (TON-36).
- **Manual order and positions** (TON-36). The tree uses creation order.
- **The main view's rows** (TON-34) and the inspector and `/a/$albumId` (TON-38).
- **Viewing and editing modes** (TON-37). Creating and renaming work in any mode until then, and TON-37 makes edit intent switch to Editing (DS-45).
- **Routes of later milestones:** `/invitations` (M7), `/s/…` (M7), `/settings/{profile,…}` (M8), `/admin/admissions` (M8), `/join/…` and `/help/recovery` (M8). Trash's content (M5) and Shared with me's (M7) are placeholders.
- **The command palette** (⌘K, M6).
- **The mobile shell** (DS-110).

## Decisions

### 1. The tree's model is pure

`features/collection/tree.ts` turns the collections into the tree. Bun tests cover it, with no DOM.
- **`buildTree(containers)`:** children by parent, each sorted by ID, which is creation order (DS-44's fallback).
  - IDs made in the same millisecond, as in one batch, used to sort at random.
  - The domain's `uuidv7()` now counts up within a millisecond, using the 12 bits after the version (RFC 9562, method 1), so they sort in the order they were made.
- **`visibleRows(tree, expanded)`:** the flattened rows a person can see, each with its level, position in its set, set size, and whether it is expanded.
- **`ancestorsOf(id)`:** the path from the root, for breadcrumbs and for expanding a view's ancestors.
- **`albumCounts(memberships)`, `unsortedCount(albums, memberships)`:** the counts.
- **`typeAhead(rows, from, text)`:** the next row whose name starts with the typed text, compared with the domain's `searchKey`, so it ignores case and accents (FR-12.5).

React reads the collections with `useLiveQuery` and builds the model with `useMemo`. At the limits (2,000 containers, 5,000 albums, about 10,000 entries) that is a few milliseconds per change.

### 2. A flat ARIA tree of links

The tree is one `role="tree"` labelled "Collection", in the order:
1. the folders and lists;
2. Unsorted;
3. Shared with me;
4. Trash.

Each item carries `aria-level`, `aria-posinset` and `aria-setsize`, the ARIA 1.2 flat form, rather than nested groups.

**Items are TanStack `Link`s with `role="treeitem"`.**
- Enter and click open the view, and a folder or list can open in a new tab, which a `div` can't do.
- An `<a href>` may take the treeitem role (ARIA in HTML).
- Nested groups would need each group inside its parent item, and an anchor can't contain the list of its children.

**Focus and selection.**
- **Roving tabindex:** one item has `tabIndex=0`. That is the focused one, or else the selected one.
- **Selection** (`aria-selected`) marks the current view's item. It follows navigation, not focus, as in a file manager's sidebar.

**Keys** (DS-27):
- ↑ and ↓ move between visible items, and Home and End jump to the ends;
- → expands a folder or moves to its first child, and ← collapses it or moves to its parent;
- Enter opens the item, as the link's default;
- printable keys type ahead, with a 700 ms buffer, except letters that are shortcuts (decision 7).

**Expansion** is a set of folder IDs, kept in `localStorage` per account (`tonaris:tree:<accountId>`), and not synced (DS-27).
- Opening a view expands its ancestors.
- Creating inside a folder expands it.
- A collapsed folder's chevron is pointer-only (`aria-hidden`), since ← and → do the same.

**Each container row** also carries TON-31's save-state pieces:
- `SaveStateMarker` with `useSaveState(id)`;
- `aria-busy` while pending or unconfirmed;
- `useLiveHighlight(id, ref)`.

*Alternative:* nested `li[role=treeitem] > ul[role=group]` with a button inside. That gives no real links, and a button inside a treeitem is an interactive child, which the pattern forbids.

### 3. Creating and renaming: one inline editor at a time

`features/collection/editing.ts` is a small store, provided above the save-state layer, that holds at most one editor:
- **create:** `{kind, parentId, name, replaces?}`;
- **rename:** `{id, name, replaces?}`.

**How an editor starts:**
- N, ⇧N and the "+" menu start a create in the place below;
- F2 starts a rename of the focused folder or list;
- Edit on a failure (decision 6) starts either, with the attempted name.

**The place for a new item** is the focused tree item's folder: the folder itself, or a list's parent. Without a focused item, it is the current view's folder: the folder, a list's parent, or the root elsewhere.

**How it shows.** The tree renders the editor in place of the row being renamed. For a create, it renders the editor as a new row at the end of the parent's children, expanding the parent, and shows a hidden sidebar.

**While typing:**
- Enter commits, and Escape cancels;
- leaving the field commits a non-blank name and cancels a blank one, as an inline cell would.

**Before anything is sent,** the name is checked with the domain's rules:
- `isBlankName`, the 200-character limit, and `findNameConflict` among the active siblings in the store;
- the refusal's text comes from the domain, so it is DS-107's;
- the domain exports `containerNameProblem(name)` and `nameTakenProblem(takenName, parentName)`, which its commands already use internally;
- a refused name keeps the editor open with the reason under it (`aria-invalid`, `aria-describedby`), and sends nothing (X-05).

**What commit does.** It is the collection's `insert` or `update`, so the save states, toasts and Activity apply as for any write (TON-31, TON-32).
- Committing an editor that `replaces` a failure dismisses it.
- Focus then returns to the item's row.

**Offline,** the "+" menu is `aria-disabled` with the tooltip "You're offline" (DS-81), and N, ⇧N and F2 do nothing.

*Alternative:* creating with a default name such as "Untitled list", as some apps do. Sibling names must be unique (FR-01.2), so a second untitled list would be refused.

### 4. Routes

Workspace routes stay under the pathless `_workspace` layout (`ssr: false`, TS-03).
- `/c` (exists);
- `f.$folderId.tsx` and `l.$listId.tsx`;
- `unsorted.tsx`, `trash.tsx` and `shared.tsx`;
- `/` moves to `_workspace/index.tsx` (decision 5).

**What a folder or list view does:**
- **Wrong kind:** a folder route given a list's ID replaces the URL with the list's route, and the other way round.
- **Not found:** an ID with no container shows "This folder or list isn't available." and a link to the collection, but only once the store is ready, so it doesn't flash during the first load.

**Page titles:**
- static ones come from each route's `head`;
- a folder or list sets `document.title` to "{name} · Tonaris" in an effect, since its name is only in the client store.

### 5. `/` opens the last view

- **Remembering.** The workspace layout remembers each collection view's path per account (`tonaris:last-view:<accountId>`).
- **Reading it.** `_workspace/index.tsx` reads it in `beforeLoad`, where the account is known, and redirects there, or to `/c`.
- **Checking it.** Only the collection views' paths are accepted: `/c`, `/f/<uuid>`, `/l/<uuid>`, `/unsorted`, `/trash` and `/shared`.
- **A signed-out visit to `/`** now goes through sign-in, like every workspace route.

*Alternative:* keeping `/` server-rendered. The server can't read this device's last view.

### 6. Edit on failures

`SaveActions` gains `edit(state)` for a failed `container.create` or `container.rename`. It starts the editor with the attempted name, its kind, and its parent or ID, and `replaces` set to the failed write.
- **Where it shows:** beside Retry in the failure's toast, in its Activity entry, and on a batch report's item (DS-84).
- **Records that are gone:** a rename of a container that no longer exists offers no Edit.

### 7. Shortcuts

`features/shell/shortcuts.ts` holds a pure key matcher: G sequences within 1.5 s, and single keys. Bun tests cover it with plain key events. `useShortcuts()` installs one `keydown` listener on the workspace.

| Keys | Action |
| --- | --- |
| G then H / U / T / S | `/c`, `/unsorted`, `/trash`, `/settings/connections` (the only settings page yet) |
| `[` | hide or show the sidebar |
| `?` | the shortcut reference |
| N / ⇧N | new list / new folder (decision 3) |
| F2 | rename the focused folder or list (handled by the tree) |

- **When they wait.** Shortcuts are ignored while focus is in an input, textarea, select or contenteditable, or while a modifier other than Shift is held (DS-78).
- **Shortcuts come before type-ahead** (decided with the creator, 22 October 2026). DS-27's type-ahead and DS-78's letter shortcuts both want letters in the tree.
  - The listener runs in the capture phase and claims a key that is a shortcut, or that starts or ends a G sequence, with `preventDefault()`.
  - The tree types ahead only with keys left unclaimed.
  - Names starting with a shortcut letter are reached with the arrows, or with ⌘K search once it exists (M6). Type-ahead gets fewer letters as shortcuts arrive (C, E, M, L, O, V, X, R).
- **The reference** is a Dialog listing the shortcuts that work now. It also opens from the account menu's "Keyboard shortcuts".
- **The Dialog** is added to `packages/ui`, on Base UI, styled like the AlertDialog.

### 8. The sidebar's size, and hiding it

`features/shell/layout.ts` keeps the width (200–360 px, default 240) and whether the sidebar is hidden, per device (`tonaris:sidebar`).
- **Resizing.** The sidebar's right edge is a `role="separator"`, `aria-orientation="vertical"`, with `aria-valuemin`, `aria-valuemax` and `aria-valuenow`.
  - It is dragged with the pointer.
  - ← and → change the width by 16 px, and Home and End go to the limits.
- **Hiding.** The sidebar leaves the grid. A "Show sidebar" button in the page header, and `[`, bring it back.
- **The SyncIndicator** is hidden with the sidebar. Problems still raise toasts (DS-108).

### 9. Views

`features/collection/views.tsx` gives every collection view the same header: breadcrumbs (`nav` labelled "Breadcrumbs") and the view's name as `h1`. The body summarizes the view until TON-34's rows, or shows its empty state.

| View | Summary | Empty (DS-105) |
| --- | --- | --- |
| Root | "{n} folders and lists" | "Start your collection — paste an album link or create a list." · **New list** |
| Folder | "{n} folders and lists" | "This folder is empty." · **New list** |
| List | "{n} albums" | "No albums yet. Paste a Spotify, Apple Music, Qobuz or Tidal link." (Add album comes with capture) |
| Unsorted | "{n} albums" | "Albums that aren't in any list show up here." |
| Shared with me | — | "Collections people share with you appear here." |
| Trash | — | "Nothing in Trash. Deleted items stay here for 30 days." |

Until the store is ready, the body is empty: no skeleton, since the header is already there (DS-106).

## Risks / Trade-offs

- **`localStorage` can throw,** in private modes or with storage blocked. → Every read and write is wrapped. Without storage, the sidebar starts at 240 px and expanded only along the current path, and `/` goes to `/c`.
- **`document.title` set by an effect** could be overwritten by `HeadContent` on later renders. → Each title is set after the route's static title, and the browser test checks it after navigating.
- **Creation order isn't arrangement.** A folder created on a device with a skewed clock sorts by that clock. → Manual order (TON-36) supersedes it.
- **Hiding the sidebar hides the SyncIndicator.** → Toasts still report problems, and `[` brings it back.

## Migration Plan

No data changes.
- **The first load after deploy:** the sidebar starts at its default size, and `/` goes to `/c`, since nothing is stored yet.
- **A signed-out `/`** now asks for sign-in, then lands on the collection.
