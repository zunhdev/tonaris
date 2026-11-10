# Tasks

## 1. Reading and bases

- [x] 1.1 `list_shared_with_me` gives `role`; the server's instructions name shares with role edit. The contract test in `mcp/shared-editing.test.ts`: "The role in Shared with me".
- [x] 1.2 The bases read content the person edits (`canEditAlbum`), and `update_album` bases on the attempted values for content they can't change. The contract tests: "Renaming a shared list", "Outside the share", "Renaming the owner's field", and the Read-only agent's tools.

## 2. Approved batches

- [x] 2.1 `lockCollections` takes every lock an approved batch needs, in one order, before its approval is used. The existing approval tests still pass.

## 3. Docs and verification

- [x] 3.1 TS-63 as built, and the MCP verification script's step 10.
- [x] 3.2 `bun run format` twice, then the full `bun run check` passes locally.

## Workflow follow-up

- Archive as the PR's last commit, check the merged spec, open the PR with `Closes TON-192`, and merge.
