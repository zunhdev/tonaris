# Tasks

## 1. The finder

- [x] 1.1 `Finder` from `list-finder.tsx`, shared by `ListFinder`; verified by the existing "Add to a list" and List field browser tests
- [x] 1.2 `folder-picker.ts`: folder choices with paths, suggestions with recent ones first, and finding by path; verified by a unit suite
- [x] 1.3 Recent folders per account on the device, recorded by every move

## 2. The dialogs

- [x] 2.1 "Move to…" with `FolderFinder`, the preview for the active option; verified by browser tests: Collection first, Recent, the count of the rest, a path word finding a folder, Enter moving, axe
- [x] 2.2 The restore prompt with `FolderFinder`, picking with a check, then Restore; verified by the recovery browser test
- [x] 2.3 The preview's room for two lines, and both dialogs pinned near the top; verified by a browser test: the dialog's top and the preview's height stay put between destinations and while typing

## 3. Docs and checks

- [x] 3.1 DS-49, DS-56 and DS-69 as built in TON-183
- [x] 3.2 `bun run check` passes

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
