# Tasks

## 1. Sections and engine

- [x] 1.1 The generator writes `search.gen.json`: openings and sections as plain text, keys' names, limits, the shortcuts list; its test checks it is current
- [x] 1.2 `engine.ts` and `terms.ts`: MiniSearch, Latin letters, stems, little words, prefix, field weights, title and phrase bonuses
- [x] 1.3 `synonyms.ts`, and typos read or offered against Help's own words
- [x] 1.4 `search.test.ts`: over a hundred searches people type, each with its page; unseen searches tried too

## 2. Interface

- [x] 2.1 The palette (3A, 5C): header button and phone icon, the home's field, ⌘K and /; Often asked, recent searches; results by page with marked snippets; the notes; ↑ ↓ Enter
- [x] 2.2 Arriving from a result: its section in view, the words marked through `CSS.highlights`
- [x] 2.3 `/help/search?q=` (3C), rendered on the server, not indexed

## 3. Checks

- [x] 3.1 `e2e/help.e2e.ts`: a synonym found and opened at its section with words marked, / and ⌘K, a typo read and one offered, the results page from the server, the home's field and recent searches, the phone's sheet, axe (all scenarios)
- [x] 3.2 Look at the palette, the results page and the phone sheet in a browser

## 4. Docs

- [x] 4.1 PRD FR-16.4 and its change log; DS-122 and the route map; TS-136
- [x] 4.2 Run `bun run check`
