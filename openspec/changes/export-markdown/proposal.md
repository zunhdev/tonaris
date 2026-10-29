# Proposal

Linear: TON-88 (Feature). Implements FR-08.2. Tech: TS-82. Done when the rendering reads well for a real collection and the README has been reviewed.

## Why

FR-08.2 puts three things in the archive: the complete data file, a readable rendering of the collection, and a short guide to the files and conventions. TON-87 built the data. This change adds the two that people and AI tools read first.

## What Changes

- **`collection.md`** (`renderCollection`): made from the export model, so it says nothing the JSON doesn't.
  - The folder tree as headings, and each list as a table in the owner's arrangement: *#, Title, Artist, Year, Type, Links*, and a column for each custom field the list's albums use.
  - Unsorted and Trash as their own sections, Trash with each unit's deletion date and the date it's deleted for good.
- **`README.md`** (`exportReadme`): the files, every part of the JSON, the conventions, versioning, what isn't included, and how an AI tool should read the archive.
- **The order rules move into the domain.** Sorting, grouping and the presentation precedence (`order.ts`, `presentation.ts`) leave the web app for `packages/domain`, so the Markdown and the app share one definition of "the owner's arrangement". The web app re-exports them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-export`: the readable rendering and the guide.

## Impact

- **`packages/domain`:** `export-markdown.ts`, `export-readme.ts`, and `order.ts` and `presentation.ts` from the web app.
- **`apps/web`:** `features/collection/order.ts` keeps the keyboard's moves and re-exports the rest; `presentation.ts` re-exports.
- **Docs:** TS-82 as built.
- **No API change.** The archive is TON-89's.
