# Proposal

Linear: TON-314 (Feature), part of P-TON-58, Help and documentation. Adds FR-16.4 (decided 21 November 2026). Done when a search typed the way people type, with their own words, typos or a whole question, finds the page that answers it, and opens it at the answer.

## Why

Help has 45 pages. Someone looking for an answer rarely knows which page holds it, or uses Tonaris's words for it: they say playlist, recycle bin or backup. The creator asked for search to be "real good", and picked its look from the canvas: a palette (3A), a results page (3C), and a full-screen sheet on a phone (5C).

## What Changes

- **Sections to search:** the page list's generator also writes every page's opening and each section as plain text, with keys' names, limits' numbers and the shortcuts list filled in.
- **The engine:** MiniSearch over those sections, stemmed words in Latin letters, synonyms from the reader's words to Tonaris's, a typo read as the word a letter away, and titles and phrases that count more. Measured by over a hundred searches people type.
- **The palette (3A, 5C):** from the header, the home's field, ⌘K or /; Often asked and recent searches; results by page with marked snippets; Showing results for, Also looked for, Did you mean.
- **Arriving from a result:** the page opens at the section with the words marked (`?hl=`).
- **The results page (3C):** `/help/search?q=`, rendered on the server.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `help-pages`: Help can be searched.

## Impact

- **`apps/web`:** `scripts/help-pages.ts` and its test; `src/help/search.gen.json`, `src/help/limits.ts`; `src/features/help/search/`; the frame, the home and a page; route `help.search.tsx`, and `?hl=` on `help.$.tsx`; `e2e/help.e2e.ts`; `minisearch` and `stemmer`.
- **`packages/ui`:** the global stylesheet styles the marks on a page opened from search.
- **Docs:** PRD FR-16.4 and its change log; DS-122 and the route map; TS-136.
