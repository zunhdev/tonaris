# Tasks

## 1. Domain, database and API

- [x] 1.1 `containerColors`, the record's `color`, `container.setColor` and its command; verified by `container-colors.test.ts` (set, clear, conflict, palette only, not in Trash) and the updated container tests
- [x] 1.2 `containers.color` with its check and a migration; the store and MCP reads and writes; verified by `db:check` and the db tests
- [x] 1.3 MCP `set_color`, and `list_container`'s color; verified by `write-tools.test.ts`
- [x] 1.4 The export's `color`, `formatVersion` 1.2 and its README; verified by the export tests

## 2. Web

- [x] 2.1 `folder.*` tokens; verified by the token test at 3:1 on every surface and a selected row
- [x] 2.2 `effectiveColor` and the chip tint; verified by `container-palette.test.ts`
- [x] 2.3 Colored icons in the tree, rows, cards, shared and guest folders; tinted list chips; the client sync, resubmission, Trash recovery and activity log for `container.setColor`
- [x] 2.4 The ⋯ menu's Color submenu and ⌘K's Color…; verified by a browser test: the submenu's colors, a folder's color shown on its list, Editing mode, Color… on the list, the chip, a reload; the palette test and the guest test

## 3. Docs and checks

- [x] 3.1 PRD FR-01.19, FR-10.4, the change log; DS-12, DS-27, DS-41, DS-46, DS-75; the tech spec
- [x] 3.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
