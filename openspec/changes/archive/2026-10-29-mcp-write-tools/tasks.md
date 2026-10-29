# Tasks

## 1. Storage and domain

- [x] 1.1 Add `mcp_operations` and its migration, `claimOperation` and `findOperation`, and prune keys with the sync history (design decision 2).
- [x] 1.2 Add `mcp-writes.ts`: base values and a view's sequence (design decisions 3 and 4).
- [x] 1.3 Move `planMove` to `packages/domain`. Verify with the web's ordering tests.
- [x] 1.4 Let Manage agents save and remove references (design decision 5). Verify with the sharing command tests: Read-only is refused, and Manage saves.

## 2. Tools

- [x] 2.1 Add `mcpWriter()` and `derivedId()`, and wire the runner and hub into `mcpRoutes` (design decision 1).
- [x] 2.2 Add the write tools, and drop G3's `add_to_list`.
- [x] 2.3 Rework `get_operation` around keys. Verify with MCP contract tests (`write-tools.test.ts`):
  - the Manage tool list, with nothing app-only, and a Read-only connection refused by name;
  - the app-only commands refuse an MCP principal (AC-37);
  - folders, lists and memberships with per-item outcomes, and the change log;
  - a rename conflict, and descriptions;
  - moves where a cycle fails alone;
  - album moves and removal to Unsorted;
  - manual order and view preferences;
  - hand-entered albums, with a failure and its skipped step;
  - a link captured, and a link needing details, answered;
  - album edits with a conflict;
  - fields applied and set in one go, cleared and removed;
  - field and option changes, with a used option and a used field kept;
  - a share link saved and dropped;
  - a key replayed and a reused key refused;
  - `get_operation`'s steps, an unknown key, and another connection's key.

## 3. Docs

- [x] 3.1 Record TS-11, TS-22, TS-63 and TS-91 as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check`, a native `bun run build`, and the OpenAPI comparison: `/v1` is unchanged.

## Workflow follow-up

- Archive the change as the PR's last commit.
