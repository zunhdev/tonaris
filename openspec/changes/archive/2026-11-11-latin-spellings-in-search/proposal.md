# Proposal

## Why

Search already ignores accents: "fleur" finds Flëur, and "maneskin" finds Måneskin. But letters that aren't accented forms (Røyksopp, Łona, Þ) can't be typed in plain letters. Spelled-out forms ("aerzte" for Die Ärzte) don't match. And Cyrillic and Greek names can't be found from a Latin keyboard ("kino" for Кино). The creator asked for this on 11 November 2026 and chose Latin, Cyrillic and Greek, leaving out Chinese, Japanese and Korean. Linear: TON-201. It changes FR-12.5.

## What Changes

- Each letter has one or more Latin spellings:
  - ø is "o" or "oe", æ is "ae", ł is "l", þ is "th";
  - ä, ö and ü are also "ae", "oe" and "ue", and å is also "aa";
  - Cyrillic and Greek letters have their common transliterations: й is "y", "i" or "j", х is "kh", "h" or "x", щ is "shch", "sch" or "sht", θ is "th".

  A query matches when it spells part of a name in any of them. Letters may mix spellings, but each letter takes one.
- A query in Cyrillic or Greek is spelled in Latin first, so "Кино" still finds Кино and also finds Kino.
- Latin letters keep only their own spelling: "jes" doesn't find Yes, and "roeyksopp" doesn't find Royksopp.
- Ranking (start, then word start, then the rest) and highlighting work as before. "kino" highlights all of "Кино".
- Every place that finds things by typing gains this: the palette, server and MCP search, "Add to a list", "Find a folder", the Trash filter and the sidebar's type-ahead.
- Sorting doesn't change. Cyrillic names don't move in among Latin ones.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `search`: matching accepts common Latin spellings of letters, in the app and on the server.

## Impact

- **Domain (`packages/domain`):**
  - `spellings.ts` holds the table of spellings;
  - `normalize.ts` gains `latinKey` (the stored and query key), `searchText` (a text ready to match), `searchParts` (what every matching stored key contains), and `searchTier`, `searchMatches` and `matchRange` over spellings;
  - `searchKey` keeps its meaning and stays the key for ordering;
  - `rankNames` and `rankAlbums` take `SearchText`s.
- **Database (`packages/db`):**
  - stored search keys become `latinKey`;
  - a custom migration empties them, and `fillSearchKeys` refills containers' and albums' keys after migrating;
  - server search filters stored keys by `searchParts` with `LIKE`, then matches the rows' names in JavaScript;
  - capture's merge candidates compare `latinKey`s.
- **Web (`apps/web`):** the search index, the palette's command matching, the list and folder pickers, the Trash filter and the type-ahead use the new matching.
- **API and MCP:** descriptions of search mention Latin spellings. The contract is unchanged. OpenAPI changes only in descriptions.
- **Docs:** FR-12.5 in the PRD, TS-12 and TS-50 in the tech spec.
