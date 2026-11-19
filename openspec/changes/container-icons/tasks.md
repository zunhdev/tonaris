# Tasks

## 1. Domain, database and API

- [x] 1.1 `containerIcons`, the record's `icon`, `container.setIcon` and its command; verified by `container-icons.test.ts` (set, clear, conflict, set only, not in Trash) and the updated container tests
- [x] 1.2 `containers.icon` with its check and a migration; the store and MCP reads and writes; verified by `db:check` and the db tests
- [x] 1.3 MCP `set_icon`, and `list_container`'s icon; verified by `write-tools.test.ts`
- [x] 1.4 The export's `icon`, `formatVersion` 1.3 and its README; verified by the export tests

## 2. Web

- [x] 2.1 The icon set, with the drawn saxophone and violin; verified by a unit test that every icon has a glyph and a name
- [x] 2.2 Own icons in the tree, rows, cards, search, shared and guest folders; the client sync, resubmission, Trash recovery and activity log for `container.setIcon`
- [x] 2.3 The ⋯ menu's Icon… and ⌘K's Icon…; verified by a browser test: the picker, an icon on a folder and not on its list, Editing mode, Icon… on the list from the palette, a reload; the palette test and the guest test

## 3. Docs and checks

- [x] 3.1 PRD FR-01.20, FR-10.4, the change log; DS-27, DS-41, DS-75; the tech spec
- [x] 3.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
