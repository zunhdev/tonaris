# Tasks

## 1. The share client

- [x] 1.1 The shared snapshot carries the owner's `seq`, read in the same snapshot. A db test in `sharing.test.ts`.
- [x] 1.2 `createShareEngine` with the sync engine's interface, and `createSyncClient`'s `engine`, `personal` and `newAlbumLists`; `album.create` carries the list a new album is made for.

## 2. On screen

- [x] 2.1 `ActiveCollectionProvider`, the own and active sync and data contexts, `OwnCollection` around the sidebar and the palette, and the place's links and navigation in the views, rows, cards, the album panel and deletion.
- [x] 2.2 The shared route shows the collection's own views for an editable share; the header's pill, the name dialog, no Delete on the share's own folder or list, and list fields in a share. The e2e test in `share-editing.e2e.ts`: "Building a list together", "Shown as editable".
- [x] 2.3 A read with the role view, or a 404, hands the view back to the viewer's page, and unsaved edits are reported. The e2e test: "Access removed while editing".

## 3. Docs and verification

- [x] 3.1 DS-70 for editors and TS-24's "Editors", as built.
- [x] 3.2 `bun run format` twice, then the full `bun run check` passes locally.

## Workflow follow-up

- Archive as the PR's last commit, check the merged spec, open the PR with `Closes TON-191`, and merge.
