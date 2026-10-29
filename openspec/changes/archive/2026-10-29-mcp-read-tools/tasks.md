# Tasks

## 1. Reads

- [x] 1.1 Add `packages/db/src/mcp-reads.ts`: usage, the tree, container and Unsorted pages in manual order, album detail (own and shared), Trash, and fields with usage (design decisions 1, 3 and 5).

## 2. Tools

- [x] 2.1 Add `results.ts`: results, failures, `agentAlbum` with the policy filter, and cursors (design decisions 2 and 4). Verify with unit tests: values pass today's policy, the marker replaces a closed source's value, sources never leave, and cursors round-trip and refuse forgeries.
- [x] 2.2 Add the read tools in `read-tools.ts`, and register them for both modes. Verify with MCP contract tests (`read-tools.test.ts`):
  - the overview's counts, usage and tree;
  - a list in manual order, and 205 albums in two pages with a forged cursor refused;
  - a shared list read, and an unshared one refused;
  - an album in full with field, link and lists;
  - an album in Trash, a shared one, and an unshared one refused;
  - Unsorted newest first, Trash units, fields with usage, Shared with me;
  - `get_operation` for its own account only.
- [x] 2.3 Update `mcp.test.ts`: a Read-only connection lists exactly the ten read tools, all `readOnlyHint`, and search's new shape.

## 3. Docs

- [x] 3.1 Record TS-63 and TS-65 as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
