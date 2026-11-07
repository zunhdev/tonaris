# Tasks

## 1. Domain, database and API

- [x] 1.1 `folderLayout` in the account defaults (Grid), `presentationOf` and `defaultsFrom` for folders, `setView` taking a folder's layout; verified by `views.test.ts` and `presentation.test.ts`
- [x] 1.2 `account_settings.folder_layout` with its check and a migration; verified by `db:check`
- [x] 1.3 The export's `formatVersion` 1.1 and its README; verified by the export tests and the validator's
- [x] 1.4 The MCP tool's description; OpenAPI regenerated; oasdiff ignore entries from CI's report, TON-164's spent ones removed; verified by `openapi:check` and CI

## 2. Web

- [x] 2.1 `coversIn` and `coversOf`; verified by unit tests: a list's order by year and by name, a folder's recursion, an empty list
- [x] 2.2 `ContainerCards` and `CoverFan`, chosen by the view's layout; Layout in a folder's View options and in Settings; verified by a browser test: the fans' covers and order, an empty list, a subfolder, the arrows and Enter, Rows kept per folder, axe
- [x] 2.3 Shared views and guest pages show cards, guests switching the folder layout for the visit; verified by the guest browser test and `guest-view.test.ts`
- [x] 2.4 Phones show folder cards two to a row; verified by the phone cards test
- [x] 2.5 Row tests set the folder layout to Rows first (`foldersAsRows`)

## 3. Docs and checks

- [x] 3.1 DS-40, DS-41, DS-44, DS-94 and the tech spec as built in TON-174
- [ ] 3.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
