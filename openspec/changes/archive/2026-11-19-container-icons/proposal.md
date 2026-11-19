# Proposal

Linear: TON-306 (Feature). Adds FR-01.20, folder and list icons (decided 19 November 2026), with FR-10.4's agent changes, FR-07.11's shared views and FR-08.3's export. Done when an icon picked in the ⋯ menu replaces a folder's icon on every device, what's inside keeps its own, and an agent can set it.

## Why

The creator's collection is sorted by genre: its top-level folders are Country, Electronic, Folk, Jazz, Metal, Opera, OST, Pop, Rap, Rock and Русский рок. Colors (TON-175) tell folders apart, but every one still has the same folder shape. An icon per folder or list, such as a guitar for Rock or horns for Metal, makes the tree quicker to scan. The creator approved the shape from a to-scale mock (19 November 2026).

## What Changes

- **An icon per folder or list** (`containers.icon`), one of 23 or none, set by a new mutation, `container.setIcon`, with the prior icon as base. It travels with the container record: bootstrap, stream, shared snapshots.
- **No inheritance:** the icon replaces the folder or list glyph of that container only; what's inside keeps its own. Its color still comes from `effectiveColor`.
- **Where it shows:** the tree, folder rows and cards, search, and shared and guest folders.
- **Setting it:** the ⋯ menu's Icon… and ⌘K's Icon…, which open one picker; either switches to Editing mode.
- **Agents:** MCP's `set_icon`; `list_container` returns the icon.
- **Export:** `tree.containers[].icon`, `formatVersion` 1.3.
- **Icons:** 21 from Lucide, plus a saxophone and a violin drawn on Lucide's grid, since Lucide has neither.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: folders and lists have icons; the sidebar menu has Icon….
- `data-export`: the export is version 1.3.
- `mcp-access`: agents set icons.
- `sharing`: viewers see a share's icons.

## Impact

- **`packages/domain`:** `containers.ts` (`containerIcons`, the record's `icon`, `iconContainer`), `sync.ts`, `commands.ts`, `collection-store.ts`, `testing.ts`, `export.ts`, `export-readme.ts`, `command-kit.ts`.
- **`packages/db`:** the column and its check, a migration; `columns.ts`, `mcp-reads.ts`, `mcp-writes.ts`.
- **`apps/api`:** MCP `set_icon`, `list_container`'s icon; OpenAPI regenerated.
- **`apps/web`:** `container-glyphs.tsx` (the icon set), `container-icon.tsx` (the picker), `icons.tsx`, the tree, rows, cards, search, `container-menu.tsx`, the palette command, `client/sync` (lists, resubmit, dependencies, trash), `sync/describe.ts`, `guest/share-content.tsx`, sharing views.
- **Docs:** PRD FR-01.20, FR-10.4 and the change log; DS-27, DS-41, DS-75; the tech spec.
