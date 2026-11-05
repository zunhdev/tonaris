# Tasks

## 1. The type

- [x] 1.1 `releaseTypes` gains `single` after `ep`, with a generated migration for the `albums.release_type` check; verified by `bun run db:check`, and by an agent's update to `single` saving through the database (`write-tools.test.ts`)
- [x] 1.2 `classify()` maps MusicBrainz's Single as EP: Single, Compilation with that secondary type, live with Live; verified by `classify.test.ts`
- [x] 1.3 `releaseGroups` and `groupNames` gain Single after EP; verified by the order tests: a single groups under Single, a live single under Live, in the sequence Album, EP, Single, Live, Compilation, Unclassified

## 2. The API, agents and exports

- [x] 2.1 The OpenAPI document regenerated; MCP descriptions say single; the export's types and readme name `single`; verified by `openapi:check`, `app.test.ts`'s enum check, the MCP update test and the grouped Markdown export test
- [x] 2.2 TON-131's spent entries leave `oasdiff-ignore.txt`; the entries for this change (variants #1, #2 and #4) are added with their reason; verified by CI's oasdiff step on the PR

## 3. The web app

- [x] 3.1 The album panel's and New album's type pickers offer Single (both use `releaseTypeOptions`), and grouping shows a Single group; verified by browser tests: the New album form's choices read Album, EP, Single, Compilation, Unknown, and a list with a single groups it under Single, after Album, in every sort

## 4. Checks

- [x] 4.1 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then run `bun run check:specs`.
