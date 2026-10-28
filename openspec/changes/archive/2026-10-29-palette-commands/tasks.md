# Tasks

## 1. Commands

- [x] 1.1 Add the command list, and build the reference from it with the navigation keys, R and ⌘Enter (design decision 1). Verify with bun tests: each command is in the reference once, with its keys.
- [x] 1.2 Extract `useCommandRunner()` with `blocked()`, add `rename` and `restore`, and capture the target when the palette opens (design decision 2). Verify with the existing shortcut e2e tests, and the palette's.

## 2. Palette

- [x] 2.1 Add recent items and command uses to `device.ts`, record what's opened in the workspace route, and add `frequentCommands` (design decision 4). Verify with bun tests: recording from paths, deduplication and cap, frequent order and starter fill.
- [x] 2.2 Add the Commands group, the `>` filter, the empty-query groups, blocked rows, and running after close (design decisions 3 and 5). Verify with Playwright (`palette-commands.e2e.ts`):
  - "> new" lists only commands;
  - Move to… on a focused list opens its dialog;
  - Open in… is blocked with its reason;
  - Recent orders what was opened;
  - a command run twice leads Frequent;
  - every command in the palette is in the reference with the same keys;
  - an axe check.

## 3. Docs

- [x] 3.1 Record DS-75 and DS-78 as built, with the creator's decisions of 29 October 2026. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
