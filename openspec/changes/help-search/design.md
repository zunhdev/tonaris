# Design

## Context

- Help's pages are MDX with frontmatter `keywords` for words people may search with that a page doesn't use (TS-136). The page list's generator already reads every page.
- The creator's picks: 3A (palette), 3C (results page), 5C (phone sheet), on the canvas "Tonaris Help look".
- Pages render on the server and the CSP refuses inline `style` attributes in server-rendered HTML.

## Goals / Non-Goals

**Goals:** find the page that answers, in the reader's words; open it at the answer; measure it, so it can't get worse unnoticed; keep it off Help pages until someone searches.

**Non-Goals:** searching the app's content (DS-75 does), a search server, search analytics, other languages.

## Decisions

### 1. Sections, not pages, in the browser

The generator writes `search.gen.json`: one entry per page's opening and per `##` section, as the text a reader sees. A result can then point at its section and quote it. The browser loads the entries (51 KB gzipped) and the engine (7 KB) when search first opens; the server loads them for `/help/search`.

Alternatives: Pagefind or a hosted search (a second build, or a service, for 300 sections); whole pages (results without the section that answers).

### 2. MiniSearch with our own words

MiniSearch ranks with BM25 and lets each field count differently: a page's title 5, a heading and the page's search words 3, keys' names 2, text 1. Words go through `latinKey`, as the app's search does, then Porter's stemmer. Little words are dropped, so a whole question is its few words that matter. The last word is a prefix.

On top: a section whose heading, page title or search words hold the reader's words counts up to twice as much, and more when they appear side by side or exactly as typed, as a dialog's question would be.

### 3. Synonyms count less than the reader's words

`synonyms.ts` maps everyday and other apps' words to Tonaris's (playlist to list, bin to Trash, backup to export), and a few phrases (log in, home screen). They are searched with the reader's words, counted at 0.6, and named: "Also looked for: list."

### 4. Typos against Help's own words

A word Help never uses is read as the one a letter away that Help uses most, and the answer says "Showing results for". Two letters away, it is only offered, "Did you mean". Words Help uses are never fuzzed, so "cover" doesn't find "over". MiniSearch's own fuzzy matching is off.

### 5. Marking on arrival without changing the page

A result links to its page with `?hl=` and its section's anchor. The page marks the reader's words in its text, or Tonaris's for them when the reader's don't appear, with the CSS Custom Highlight API. The DOM and the server's HTML stay as they are.

### 6. Measured by searches people type

`search.test.ts` lists over a hundred searches, with typos, other apps' words and whole questions, each with the page it must find first or among the first three. Unseen searches were tried as well, to check the tuning carries over.

## Risks / Trade-offs

- **Synonyms are a list to keep:** a new page with new words may need entries; its frontmatter `keywords` covers what's particular to it.
- **Phones:** typing on the home's field opens the palette and moves the focus there; whether iOS keeps the keyboard up through that is unchecked on a real phone.
