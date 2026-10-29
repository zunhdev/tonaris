# Tasks

## 1. Domain

- [x] 1.1 Refuse recovery of an expired unit in `recoverUnit` (design decision 3). Verify with the trash tests, and through MCP.

## 2. Tools

- [x] 2.1 Add `recover_from_trash`, and sharing effects for it and `move_items` (design decisions 1 and 2). Verify with MCP contract tests (`trash-tools.test.ts`):
  - an album back to its lists, reporting a list still in Trash;
  - a list back with its albums;
  - a destination and a name asked for, then answered, each unit on its own;
  - a recovered list's skipped album;
  - who sees it again in a shared folder;
  - an expired unit and a missing one;
  - Read-only inspects but can't recover;
  - a move into a linked folder.

## 3. Docs

- [x] 3.1 Record TS-63 as built. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
