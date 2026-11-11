# Tasks

## 1. Spellings and matching (domain)

- [x] 1.1 `packages/domain/src/spellings.ts`: the table of Latin spellings for Latin letters with no accent-free form, spelled-out umlauts and å, and the Cyrillic and Greek alphabets.
- [x] 1.2 `normalize.ts`: `latinKey`, `searchText`, `searchTier` and `matchRange` over spellings, `searchMatches`, and `searchParts`. `searchKey` is unchanged. Tests in `normalize.test.ts`: the new fixture cases, ranking across spellings, Latin letters keeping their own spelling, highlights, and a property test of every part of every spelling plus `searchParts` soundness.
- [x] 1.3 `rankNames` and `rankAlbums` take `SearchText`s and tie by `latinKey`.
- [x] 1.4 Parity fixtures in `normalize.json`: `latinKey` cases and search cases for each kind of spelling.

## 2. Server

- [x] 2.1 Stored keys are `latinKey`: write paths in `columns.ts`, test helpers, the MCP test harness and the workload generator.
- [x] 2.2 The custom migration `latin_search_keys` empties the keys, and `fillSearchKeys` refills containers' and albums'. A db test covers albums.
- [x] 2.3 `searchCollection` filters by `searchParts`, then matches names, titles and artists with `searchText`. A db test: Cyrillic lists and albums found by Latin letters, in order and located.
- [x] 2.4 Capture compares `latinKey`s.
- [x] 2.5 Descriptions in the API route and MCP tool mention Latin spellings. OpenAPI regenerated, descriptions only.

## 3. Web

- [x] 3.1 The search index, the palette's command matching, the list and folder pickers, the Trash filter and the type-ahead use the new matching. Ordering keeps `searchKey`.
- [x] 3.2 Tests: the index finds Кино by "kino" and Ärzte by "aerzte"; the pickers find a Cyrillic path by Latin words; the type-ahead takes "oexa" for "Öxabäck"; the 5,000-album timing includes Cyrillic and umlaut titles.
- [x] 3.3 The search browser test finds an album by "Кино" by typing "kino", highlighted in Cyrillic.

## 4. Docs and verification

- [x] 4.1 FR-12.5 in the PRD; TS-12 and TS-50 in the tech spec, as built in TON-201.
- [x] 4.2 `bun run check` passes locally.
