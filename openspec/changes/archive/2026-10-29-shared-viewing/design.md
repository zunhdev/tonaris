# Design

## Context

- **View preferences and positions** are the person's own rows, keyed by `viewKey`: the container's ID, `root` or `unsorted`. They're synced through their change log (TS-16).
- **`viewKindOf()`** accepts only the person's own containers. The db's `viewItems()` lists a folder's children by owner.
- **TON-64's `sharedSnapshot()`** and **TON-70's guest rendering and stream** exist. **TON-68's `/shared`** lists references without opening them.

## Goals / Non-Goals

**Goals:**
- the viewer page;
- personal, synced presentation, manual order included;
- live updates;
- links from Shared with me.

**Non-Goals:**
- Shared with me in the sidebar tree, grouped by owner (DS-31 item 6): `/shared` is its index, and the tree keeps one Shared with me item;
- the inspector for shared albums;
- grid rearranging;
- drag.

## Decisions

### 1. Views of shared content

- **The store** gains `canReadShared(personId, containerId)`. The db answers it with `canReadContainer`; the memory store with a set the tests give it.
- **`viewKindOf`** accepts the person's own containers, or ones they may read. Anything else stays `not_found`.
- **The db's `viewItems`** lists a folder's active children without the owner filter. The view was authorized, and a shared folder's children are someone else's.
- **Records stay the person's own:** `view.set` and `order.set` write the person's own rows (`person_id` = the viewer), so the owner's are never read or changed.

### 2. The API

- **`GET /v1/shared/{id}`:** `sharedSnapshot(person, id)`, with artwork signed.
- **`GET /v1/shared/{id}/stream`:** authorizes as the snapshot does, then watches the owner in the hub, as TON-70's guest stream does.

### 3. The page

- **Route:** `/shared/$containerId`, under the workspace, with `?c=` for a container inside the share, as on guest pages.
- **Rendering:** `features/sharing/shared-view.tsx` reuses the guest page's folder rows, album rows and cards, and Open chooser, factored into `features/guest/share-content.tsx`.
- **Access checks** move to `packages/db/src/access.ts`, so the sync store can use them without an import cycle.
- **Presentation** is `presentationOf(kind, views.get(c), defaults)` from the person's own collections, so defaults and remembered choices behave as for their own views. View options write `view.set` through the client's `views` collection, like the owner's.
- **Manual order:**
  - `arranged()` with the person's keys for that view, falling back to when each album was added.
  - In rows, ⌥↑ and ⌥↓ (⇧ for the ends) on a row's Move button plan the move and write it through `useRearrange`, as the owner's views do.
- **The pill:** "View only · Shared by {name}", in the header where the mode toggle would be.
- **Live:** `useShareStream` takes the stream's URL, and re-reads the snapshot.

## Risks / Trade-offs

- **[A focusable row isn't a valid list item]** → The owner's rows are a grid. The viewer's are a list, so in manual order each album row has a Move button that takes ⌥↑ and ⌥↓, and a folder's rows move from their links.
- **[Resubmitting a conflicting view choice]** → The outbox's resubmission treats a view it can't find among the person's own containers as gone, so a choice that conflicted with another device's is dropped, and that device's shows. The choice is presentation only.

- **[A viewer's positions refer to someone else's albums]** → They're keyed by the viewer and the view, and only ever read for that view, as owners' positions are. Content that leaves the share is ignored in arranging.

## Migration Plan

None.
