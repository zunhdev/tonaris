# Design

## Context

The sidebar's tree (`collection-tree.tsx`, model in `tree.ts`) holds the person's folders and lists, then places. Shared with me was a place. Its page read `GET /v1/shared`, whose entries carried each reference's name, kind, owner and availability, but not what's inside a shared folder: only `GET /v1/shared/{id}`, the whole share with its albums, had that. Each shared view follows its share's stream, which says "read again" after each of the owner's saves.

## Decisions

### 1. The folders come with Shared with me

`GET /v1/shared` gives each available entry's active folders and lists (`containers`: id, kind, parent, name), read with one recursive query over all the entries. The sidebar draws the whole of Shared with me from that one read, without fetching each share's albums. An entry that can't be opened gives none. It's an additive response field.

### 2. One read for the workspace

The entries' read moves from the Shared with me page into a provider for the workspace (`SharedEntriesProvider`), so the sidebar and the page share it. It reads again as before (on load, on focus, when the person's references change), and on request.

### 3. Live while open

A shared folder that is open in the sidebar follows its share's stream and reads the entries again after each save, so its folders and lists follow the owner. Closed ones, and names, catch up on focus and on reference changes. A tab opens one stream per share however many follow it (`use-share-stream.ts` keeps them by path), so a shared view on screen and the sidebar share theirs.

### 4. The tree's model

`buildSharedTree` turns the entries into items, by name with those that can't be opened last, each folder's contents in the person's own sort for that folder, as their own folders and the shared view use. `visibleRows` puts them under Shared with me while it's open, which starts open: its closed state is kept with the expanded folders, under a reserved key. Rows carry the same level, position and set size. ← from a top item goes to Shared with me, and closing a folder or Shared with me that holds the view opens its view, as TON-121 does for the person's own folders.

### 5. Names

A top item reads "Metal · Denis", its owner in `fg.tertiary`. The visible text is its accessible name, so it meets label-in-name (WCAG 2.5.3); an `aria-label` of "Metal, shared by Denis" failed axe's check.
