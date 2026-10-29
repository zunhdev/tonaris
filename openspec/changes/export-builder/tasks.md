# Tasks

## 1. Builder

- [x] 1.1 Add `packages/domain/src/export.ts`: the Zod schema, the JSON Schema, and `buildExport` (design decisions 1 to 6). Move the withheld marker's literal into the domain. Verify with `export.test.ts`: an album in two lists once, the three kinds of empty, choice labels, Trash units, personal order, the withheld marker, and Zod parsing the output.

## 2. Reader

- [x] 2.1 Add `packages/db/src/export.ts`, one read-only REPEATABLE READ transaction over the owner's collection tables. Verify with an integration test, where a shared list, a saved reference to another owner's list, a display name and an invitation stay out of the export.
- [x] 2.2 Build the 5,000-album workload's export, and parse it with the schema. Record the time.

## 3. Docs and checks

- [x] 3.1 Record TS-81 as built.
- [x] 3.2 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
