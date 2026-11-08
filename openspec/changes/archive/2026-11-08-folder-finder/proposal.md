# Proposal

Linear: TON-183 (Feature). Implements FR-01.4 and FR-01.5 (moving folders and lists) through DS-49's "Move to…", and FR-01.15 (a recovery's destination) through DS-56's destination prompt, with the finding of "Add to a list" (TON-177, FR-12.5). Also DS-69's preview in both. Done when both dialogs find folders by typing and their preview no longer moves what's above it.

## Why

From the creator's manual testing (8 November 2026), "Move '{name}' to…" had three problems:
- it listed every folder at once, as an indented tree, which is very long with many folders;
- it had no search, unlike "Add to a list" and the List field (TON-177, TON-181);
- its sharing preview, which follows the folder pointed at, took one line or two. The dialog is centred, so each change moved the whole dialog, folders under the pointer included.

Trash's "Choose where to restore '{name}'" listed every folder the same way (decided with the creator: same change).

## What Changes

- **"Find a folder"** has the focus in both dialogs, a combobox over the folders, as "Find a list" is.
- **Before typing** (decided with the creator): Collection first, then under "Recent" the folders this device last moved things into, newest first, then others by path, 8 folders in all. "Type to find the other {n} folders." counts the rest.
- **Typing** finds folders by the words of their path, at most 50, those whose name matches first.
- **Move to…:** Enter or a click moves; the preview is for the active folder.
- **Restore:** Enter or a click picks the folder, with a check, and the preview is for it; Restore restores.
- **The preview** keeps room for two lines, and both dialogs keep their top edge while open (decided with the creator), so only the bottom edge can move.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: a destination folder is found by typing.
- `sharing`: a move's or restore's preview doesn't move the places above it.

## Impact

- **`apps/web`:** the finder's field, listbox and marked paths move from `list-finder.tsx` into a shared `finder.tsx`. A new `folder-finder.tsx` and pure `folder-picker.ts` replace `place-list.tsx` in `move.tsx` and `trash/recovery.tsx`. Recent folders are kept per account in `common/device.ts`. `SharingImpactBlock` can keep room for two lines. Tests: `manual-order.e2e.ts`, `sharing-impact.e2e.ts`, `container-menu.e2e.ts`, `recovery.e2e.ts`, and a new unit suite.
- **Docs:** DS-49, DS-56 and DS-69 as built.
- No API, data or sync change.
