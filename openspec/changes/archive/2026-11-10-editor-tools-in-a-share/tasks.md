# Tasks

## 1. Tools

- [x] 1.1 `NamingProvider` and `useStartNaming`; `useStartEditor` opens the name dialog in a share. The e2e test in `share-editing.e2e.ts`: "A new list by shortcut".
- [x] 1.2 Move to in a share: the share's folders only, and nothing for the share's own folder or list. The e2e test: "Moving the share itself", "Moving inside".
- [x] 1.3 Deletion: ⌫ on the share itself refused, and the editor's copy for lists, folders and albums. The e2e test: "Deleting an album".

## 2. Previews

- [x] 2.1 `editorsMoveImpact`, the impact route's fallback, `withheld`, and its line. A db test in `sharing.test.ts`: "Into a folder shared with someone else", and the e2e test's "Sharing unchanged".

## 3. Docs and verification

- [x] 3.1 DS-50, DS-69 and DS-70, as built.
- [x] 3.2 `bun run format` twice, then the full `bun run check` passes locally.

## Workflow follow-up

- Archive as the PR's last commit, check the merged spec, open the PR with `Closes TON-195`, and merge.
