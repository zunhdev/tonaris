# Tasks

## 1. Shared order

- [x] 1.1 Move `order.ts`'s sorting and grouping and `presentation.ts` into `packages/domain`, and re-export them from the web app (design decision 2). Verify with the web app's existing `order.test.ts` and `presentation.test.ts`.

## 2. Rendering

- [x] 2.1 Add `renderCollection` (design decisions 1, 3, 4 and 5). Verify with `export-markdown.test.ts`: the headings, a manual order, Unsorted and Trash, cells, escaping, grouping, and deep trees.
- [x] 2.2 Add `exportReadme` (design decision 6). Verify that it names every top-level part of the schema.
- [x] 2.3 Render the 5,000-album workload and read it.

## 3. Docs and checks

- [x] 3.1 Record TS-82 as built.
- [x] 3.2 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
