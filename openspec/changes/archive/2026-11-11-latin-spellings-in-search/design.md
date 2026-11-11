# Design

## Context

`searchKey` (TS-12) folds case and strips accents. It is stored with every row and searched by substring, in the app's index and on the server through pg_trgm indexes (TS-50). It also orders names in views (`order.ts`, the sidebar's tree and the pickers' paths). Some letters have several common Latin spellings: ä as "a" or "ae", й as "y", "i" or "j". One key per text can't hold all of them.

## Goals / Non-Goals

**Goals:**

- A query typed in plain Latin letters finds names written with ø, æ, ł, þ and similar letters, umlauts and å spelled out, and Cyrillic and Greek names.
- The app and the server give the same results in the same order.
- Ranking and highlighting keep working.
- Sorting doesn't change.

**Non-Goals:**

- Chinese, Japanese and Korean romanization, which is ambiguous.
- Spelling rules that depend on neighbouring letters, such as Greek "ου" as "u" or "μπ" as "b". Per-letter spellings cover the common cases.
- Typo tolerance.

## Decisions

### Letters with spellings, matched exactly

**Decision.** `spellings.ts` gives each letter that needs it a list of Latin spellings, the first being its key. Examples: `ä: a ae`, `й: y i j`, `щ: shch sch sht`, `ь: (dropped)`. A text becomes a sequence of letters, each with its spellings. A query becomes its `latinKey`, every letter in its first spelling.

The query matches when it spells consecutive letters of the text, starting and ending anywhere, even inside a spelling. `matchFrom` walks the letters, keeping the set of query positions reached.

Texts with no letter that has a choice keep the plain substring match on their key.

**Why not fold variants together?** Folding both sides (for example "ae" → "a", "kh" → "h") breaks typing letter by letter: "k" stops matching "Khan" once "kh" folds to "h". It also merges Latin letters: "jes" would find "Yes". With exact matching, Latin letters keep only their own spelling.

**Why not store every spelling?** The combinations multiply with each letter.

Letters are looked up precomposed, before accents are stripped, so й and ё keep their spellings. Anything not in the table falls back to `searchKey`'s treatment, so `latinKey` equals `searchKey` for text without such letters.

### Two keys: one for ordering, one for search

**Decision.** `searchKey` keeps its meaning and orders views, paths and the tree. `latinKey` is the stored search key and the tie-break among search results.

**Why.** Transliterating the ordering key would sort Кино among the K's. Search results sort within a tier by `latinKey`. There, Кино next to Kino is what a person who typed "kino" expects.

### The server narrows by parts, then matches in JavaScript

**Decision.** `searchParts(queryKey)` returns the parts of the query that every matching key must contain, in order. It leaves out any stretch that may be another letter's other spelling, including partial ones at either end. The server looks for `%part%part%` in the stored keys, so the trigram indexes still apply. Then it matches the rows' names, titles and artists with `searchText`, and ranks them with `rankNames` and `rankAlbums`, as the app does.

**Why.** SQL can't try spellings. A sound filter plus the same JavaScript match keeps parity.

**Trade-off.** Short or vowel-heavy queries narrow little: "kino" keeps only "k". That means a scan of the owner's rows, which TS-50 already accepts at 5,000.

**Checked by a property test.** Every substring of every spelling of sample names matches, and its parts occur in order in the key.

### Recomputing stored keys

**Decision.** A custom migration empties all three key columns. `fillSearchKeys`, which already runs after migrations, now refills both containers and albums. Write paths store `latinKey`. Capture compares `latinKey`s, so Mötley Crüe and Motley Crue still collide as merge candidates. Кино and Kino now do too, which is harmless for candidates.

## Risks / Trade-offs

- **[More matches inside Cyrillic and Greek text]** For example, "a" can match я. → Only names written in those alphabets gain extra matches. Latin text matches as before.
- **[Index build time for non-Latin collections]** → Measured at 5,000 albums, all Cyrillic: the build takes 11 ms and the slowest query 6 ms, against 50 ms. The search-index test now includes Cyrillic and umlaut titles.
- **[Deploy window]** Between the migration and the fill, keys are empty. Both run in the same migrate command before the app starts.

## Migration Plan

- `bun run db:migrate` empties the keys and refills them.
- To roll back, deploy the previous app and run its migrate. Its `fillSearchKeys` refills only containers, so albums' keys would stay in Latin spellings. Old search still finds ASCII names, and other names are fixed when they are next renamed. Acceptable for a rollback.
