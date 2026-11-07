# Proposal

Linear: TON-174 (Feature). Extends FR-05.2's personal presentation and FR-11.7's account defaults to folders' and the root's layout (DS-40, DS-41, DS-44, DS-94), with FR-07.17's shared views and FR-11.9's guest views, and FR-08.3's export of the defaults. Done when folders open as fanned cards, Rows is a choice kept per folder, and the album grid's keyboard rules hold.

## Why

From TON-166's mock (7 November 2026), the creator picked 13C: folders show their lists as cards fanning their first covers, as Eagle shows subfolders. Folders were rows of icons, saying nothing of what's inside. The creator decided folders open as cards by default, and that a subfolder's card shows the first covers found inside it.

## What Changes

- **A layout for folders and the root:** Rows or Grid, in their View options, remembered per view like a list's. `view.set` takes a layout for folders; grouping is still refused.
- **Their own default, Grid:** a new account default, `folderLayout`, starting at Grid for everyone, existing accounts included. "Save as my default" saves it; Settings → Preferences has it.
- **Cards:** a list's card fans its first three covers in its person's presentation of it; a subfolder's, the first found inside it, top to bottom; with its name and what it holds. An empty one shows its icon. Cards walk by keyboard as album cards do, and show on phones, shared views and guest pages, where guests switch the folder layout for the visit.
- **API (closed testing):** `defaults.set` takes `folderLayout` in place; the defaults in the bootstrap and the stream carry it; oasdiff ignore entries name the change. **Database:** `account_settings.folder_layout`, default `grid`. **Export:** `accountDefaults.folderLayout`, `formatVersion` 1.1. **MCP:** `set_view_preferences` says folders take a layout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `views-and-ordering`: folders and the root take a layout, cards by default; View options and the account defaults include it.
- `data-export`: the export's version is 1.1.
- `sharing`: guests switch folders' layout for the visit.

## Impact

- **`packages/domain`:** `views.ts` (`folderLayout`, `setView`), `presentation.ts`, `export.ts` and `export-readme.ts`.
- **`packages/db`:** the column, its check and a migration; `columns.ts`.
- **`apps/api`:** the MCP tool's description; OpenAPI regenerated; `oasdiff-ignore.txt`.
- **`apps/web`:** new `container-cards.tsx`, `cover-fan.tsx`, `container-covers.ts`; `views.tsx`, `view-options.tsx`, `settings/preferences.tsx`, `sync/describe.ts`, `guest/share-content.tsx`, `guest/guest-page.tsx`, `guest/guest-view.ts`, `sharing/shared-view.tsx`. Browser tests that check rows now set the account's folder layout to Rows first.
- **Docs:** DS-40, DS-41, DS-44, DS-94; TS's data model and TON-174 note.
