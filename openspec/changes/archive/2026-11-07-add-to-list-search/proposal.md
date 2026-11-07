# Proposal

Linear: TON-177 (Feature). Implements FR-01.6 (albums in many lists) through DS-46's "Add to list…", with FR-12.5's matching. Done when the dialog finds lists by typing and suggests 8 before anything is typed.

## Why

From the creator's manual testing (7 November 2026): "Add '{title}' to a list" listed every list the album isn't in, all at once. A person can have thousands of lists, which made it a long scroll and a slow dialog.

## What Changes

- **A "Find a list" field,** focused when the dialog opens: a combobox over the lists, as the palette's is (DS-115). ↑ and ↓ move through them, and Enter or a click adds the album.
- **Before typing, 8 lists** (decided with the creator): under "Recent", the lists albums were most recently added to, newest first, from the entries' added dates; then others by path. A line counts the rest.
- **Typing matches the path:** every typed word must be in the list's folders' names or its own, case- and accent-insensitively. Lists whose name matches the whole text come first. At most 50 show, with a line asking for more typing; "No lists match '{text}'." when none do.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `album-records`: "Add to a list" finds lists by typing and suggests recent ones.

## Impact

- **`apps/web`:** a new `features/collection/list-picker.ts` (choices, suggestions, matching), used by `add-to-list.tsx`, which becomes a combobox. Tests: `list-picker.test.ts`, `album-inspector.e2e.ts`.
- **Docs:** DS-46 as built.
- No API, data or sync change.
