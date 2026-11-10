# Proposal

## Why

The server takes editors' changes since TON-189, but the app still opens every share view-only. This change gives a person who can edit a share the collection's own editing tools on it, on the desktop, with the owner's and their changes reaching each other live. Linear: TON-191. It implements FR-07.18 and FR-07.19 in the app (DS-70 for editors), with FR-09.3 for edits lost when access ends.

## What Changes

- **A share client:** a second sync client on a share engine. It reads the share when opened, after each notice and when a write waits on it, and confirms writes against the owner's `seq`, which the shared snapshot now carries.
- **On screen:** while an editable share is open on the desktop, the active collection swaps to the share's client for the views, the inspector, the dialogs, captures and save states. The sidebar and the palette keep the person's own collection. Links inside the share stay in it.
- **The view:**
  - the collection's own folder and list views, with "Can edit · Shared by {owner}" and breadcrumbs from Shared with me;
  - a name dialog for New list, New folder and Rename;
  - no Delete on the shared folder or list itself;
  - Add albums and New album go into one of the share's lists.
- **Losing access:** the view falls back to the viewer's page, which says it's no longer available, and edits not yet saved are reported.
- **Viewers and phones** keep the viewer's page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sharing`: a share the person can edit opens editable in the app, live both ways; losing access is reported.

## Impact

- **API:** the shared snapshot gains `seq`, an additive response field.
- **Web:**
  - `client/sync/share-engine.ts`, and `createSyncClient`'s `engine`, `personal` and `newAlbumLists`;
  - `features/sharing/editable-share.tsx`, `features/collection/place.tsx`, `own-collection.tsx`, `name-dialog.tsx`;
  - the workspace's provider order, the shell's own-collection boundary, and the shared route;
  - the views' header and breadcrumbs, and links in rows, cards, the album panel and deletion through the place.
- **Docs:** DS-70 for editors, and TS-24's "Editors", as built.
- **Not here:** shortcuts, Move to, dragging and deletion copy inside a share (TON-195), and the MCP tools (TON-192).
