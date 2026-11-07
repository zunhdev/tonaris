# Proposal

Linear: TON-175 (Feature). Adds FR-01.19, folder and list colors (decided 7 November 2026), with FR-10.4's agent changes, FR-07.11's shared views and FR-08.3's export. Done when a color picked in the ⋯ menu shows on the folder and everything inside without one, on every device, and an agent can set it.

## Why

From TON-166's mock (7 November 2026), the creator picked 10C, folder colors that what's inside takes on, and 16A, list chips tinted with them, and decided lists may have colors too. Every folder and list icon was the same gray; colors make the tree quick to scan, as Eagle's folders do.

## What Changes

- **A color per folder or list** (`containers.color`), one of eight (red, orange, amber, green, teal, blue, violet, pink) or none, set by a new mutation, `container.setColor`, with the prior color as base. It travels with the container record: bootstrap, stream, shared snapshots.
- **Inheritance:** a folder or list without its own color shows the nearest folder's, in the tree, folder rows and cards, shared and guest folders, and the album panel's list chips (tinted).
- **Setting it:** the ⋯ menu's Color submenu, and ⌘K's Color… dialog; either switches to Editing mode.
- **Agents:** MCP's `set_color`; `list_container` returns the color.
- **Export:** `tree.containers[].color`, `formatVersion` 1.2.
- **Tokens:** `folder.*` colors, each at least 3:1 on every surface and a selected row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: folders and lists have colors, shown on what's inside; the sidebar menu has Color.
- `data-export`: the export is version 1.2.
- `mcp-access`: agents set colors.
- `sharing`: viewers see a share's colors.

## Impact

- **`packages/domain`:** `containers.ts` (`containerColors`, the record's `color`, `colorContainer`), `sync.ts`, `commands.ts`, `collection-store.ts`, `testing.ts`, `export.ts`, `export-readme.ts`.
- **`packages/db`:** the column and its check, a migration; `columns.ts`, `mcp-reads.ts`, `mcp-writes.ts`.
- **`packages/ui`:** `folder.*` tokens and their contrast test.
- **`apps/api`:** MCP `set_color`, `list_container`'s color; OpenAPI regenerated.
- **`apps/web`:** `container-palette.tsx`, `container-color.tsx`, `icons.tsx`, the tree, rows, cards, `album-details.tsx`, `container-menu.tsx`, the palette command, `client/sync` (lists, resubmit, dependencies, trash), `sync/describe.ts`, `guest/share-content.tsx`, `guest-page.tsx`, `sharing/shared-view.tsx`.
- **Docs:** PRD FR-01.19, FR-10.4 and the change log; DS-12, DS-27, DS-41, DS-46, DS-75; the tech spec.
