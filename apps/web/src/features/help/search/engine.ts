// Help's search (FR-16.4, DS-122, TON-314): every section of every page, found by the words people use. Runs the
// same in the browser, which loads the sections when search opens, and on the server, for /help/search.
// - Words are read as terms.ts reads them; the last word may be unfinished.
// - A word Help never uses is read as the one it is a letter away from ("spotfy" as "spotify"), and the answer says
//   so. Two letters away ("vynil"), it is only offered, as "Did you mean". Words Help uses are taken as they are, so
//   "cover" never finds "over".
// - The reader's words find Tonaris's too (synonyms.ts), counting a little less, and the answer names them.
// - A page's title counts most, then a section's heading, the page's search words and the names of its keys, then
//   the text.
// - A section whose titles hold the reader's words counts more, and more again when it holds what they typed as it
//   stands, such as a dialog's question.
// - Sections with every word come first, then sections with some.
// Results are pages, each with its best sections, each with a snippet whose matching words are marked.

import MiniSearch, { type SearchResult } from "minisearch";

import { phraseSynonyms, synonymsOf } from "./synonyms";
import {
  countedWords,
  isMarked,
  markedTerms,
  phraseKey,
  searchTerm,
  wordKey,
  words,
  type MarkedTerms,
} from "./terms";

/** One section of a page, as the page list's generator writes it (scripts/help-pages.ts). */
export type HelpSearchDoc = {
  /** `slug#anchor`, or the slug for the page's opening. */
  id: string;
  slug: string;
  /** The page's title. */
  page: string;
  /** Its section of Help, such as Share. */
  section: string;
  /** The section's heading; empty for the page's opening. */
  heading: string;
  /** The heading's id; empty for the page's opening. */
  anchor: string;
  /** The page's summary and the search words from its frontmatter, on its opening only. */
  keywords: string;
  /** The names of the keys the section shows, such as "cmd command ctrl control k"; searched, not shown. */
  keys: string;
  /** What the section says, the opening starting with the page's summary. */
  text: string;
};

export type SnippetPart = { text: string; hit: boolean };

export type HelpSearchHit = {
  id: string;
  /** The section's heading; empty for the page's opening. */
  heading: string;
  anchor: string;
  snippet: SnippetPart[];
};

export type HelpSearchResult = {
  slug: string;
  page: string;
  section: string;
  hits: HelpSearchHit[];
};

export type HelpSearchAnswer = {
  results: HelpSearchResult[];
  /** What was searched for, when a typo was read as a word Help uses: "spotify" for "spotfy". */
  showingFor: string | undefined;
  /** Tonaris's words that were looked for too, such as "list" for "playlist". */
  alsoLookedFor: string[];
  /** For a query with a word Help doesn't use, a spelling that finds sections with every word. */
  didYouMean: string | undefined;
};

export type HelpSearch = {
  /** Up to `pages` pages for `query`, best first. */
  search(query: string, pages?: number): HelpSearchAnswer;
};

/** As indexed: the term, and the word itself when it differs, so an unfinished word finds it by its start. */
function indexTerms(word: string): string[] | null {
  const term = searchTerm(word);
  if (term === null) return null;
  const key = wordKey(word);
  return term === key ? [key] : [term, key];
}

/** A cell of the table `distance` fills; outside it, too far. */
const cell = (row: readonly number[], k: number) => row[k] ?? Infinity;

/** How many letters apart two words are: one added, removed or changed, or two side by side swapped, each count one. */
function distance(a: string, b: string): number {
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(
        cell(previous, j) + 1,
        cell(current, j - 1) + 1,
        cell(previous, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, cell(before, j - 2) + 1);
      current.push(d);
    }
    before = previous;
    previous = current;
  }
  return previous[b.length] ?? Infinity;
}

/** The terms of `text`'s words that count, in order. */
const termsOf = (text: string) => words(text).flatMap((word) => searchTerm(word) ?? []);

/** `query` with `from`'s words, in order, replaced by `to`'s. */
function replaceWords(query: string, from: readonly string[], to: readonly string[]): string {
  let done = "";
  let rest = query;
  for (const [i, word] of from.entries()) {
    const at = rest.indexOf(word);
    if (at < 0) continue;
    done += rest.slice(0, at) + (to[i] ?? word);
    rest = rest.slice(at + word.length);
  }
  return done + rest;
}

const fields = ["page", "heading", "keywords", "keys", "text"] as const;

/** A snippet's length, in characters, and how much comes before its first match. */
const snippetLength = 180;
const snippetLead = 60;

/** Whether a section's titles hold all of `text`'s words that count. */
const holds = (title: ReadonlySet<string>, text: string) =>
  words(text).every((word) => {
    const term = searchTerm(word);
    return term === null || title.has(term);
  });

/** About `snippetLength` characters of `text` around its first match, the matching words marked. */
function snippet(text: string, marks: MarkedTerms): SnippetPart[] {
  const tokens = [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)];
  const first = tokens.find((token) => isMarked(token[0], marks));
  let start = Math.max(0, (first?.index ?? 0) - snippetLead);
  if (start > 0) start = text.indexOf(" ", start) + 1;
  let end = Math.min(text.length, start + snippetLength);
  if (end < text.length) end = Math.max(text.lastIndexOf(" ", end), start + 1);
  const parts: SnippetPart[] = [];
  let at = start;
  for (const token of tokens) {
    const from = token.index;
    if (from < start || from + token[0].length > end || !isMarked(token[0], marks)) continue;
    if (from > at) parts.push({ text: text.slice(at, from), hit: false });
    parts.push({ text: token[0], hit: true });
    at = from + token[0].length;
  }
  if (at < end) parts.push({ text: text.slice(at, end), hit: false });
  if (start > 0) parts.unshift({ text: "…", hit: false });
  if (end < text.length) parts.push({ text: "…", hit: false });
  return parts;
}

export function createHelpSearch(docs: readonly HelpSearchDoc[]): HelpSearch {
  const index = new MiniSearch<HelpSearchDoc>({
    fields: [...fields],
    storeFields: [],
    tokenize: words,
    processTerm: indexTerms,
    searchOptions: {
      tokenize: words,
      processTerm: searchTerm,
      boost: { page: 5, heading: 3, keywords: 3, keys: 2, text: 1 },
    },
  });
  index.addAll(docs);
  const byId = new Map(docs.map((doc) => [doc.id, doc]));

  // The words Help uses, and how often, for reading typos; and the terms they make.
  const vocabulary = new Map<string, number>();
  const terms = new Set<string>();
  for (const doc of docs) {
    for (const field of fields) {
      for (const word of words(doc[field])) {
        const term = searchTerm(word);
        if (term === null) continue;
        terms.add(term);
        const key = wordKey(word);
        vocabulary.set(key, (vocabulary.get(key) ?? 0) + 1);
      }
    }
  }
  const keys = [...vocabulary.keys()];

  /** Whether Help uses `word`, or, while it is the last word, a word that starts with it. */
  function known(word: string, last: boolean): boolean {
    const term = searchTerm(word);
    if (term !== null && terms.has(term)) return true;
    const key = wordKey(word);
    return last && keys.some((each) => each.startsWith(key));
  }

  /** The word Help uses most of those closest to `word`, at most `most` letters away. */
  function closest(word: string, most: number): string | undefined {
    const key = wordKey(word);
    let best: { key: string; distance: number; uses: number } | undefined;
    for (const [each, uses] of vocabulary) {
      if (each.length < 3 || Math.abs(each.length - key.length) > most) continue;
      const apart = distance(key, each);
      if (apart > most) continue;
      if (!best || apart < best.distance || (apart === best.distance && uses > best.uses)) {
        best = { key: each, distance: apart, uses };
      }
    }
    return best?.key;
  }

  /** `said` with each word Help doesn't use read as the closest one it does, if one is near enough. */
  function correct(said: readonly string[], most: (length: number) => number): string[] {
    return said.map((word, i) => {
      if (known(word, i === said.length - 1)) return word;
      const reach = most(wordKey(word).length);
      return (reach > 0 && closest(word, reach)) || word;
    });
  }

  // What each section's titles say (its heading, its page's title and, on the page's opening, its search words), and
  // its words as phrases are compared.
  const titles = new Map(
    docs.map((doc) => {
      const said = words(`${doc.page} ${doc.heading} ${doc.keywords}`);
      return [doc.id, new Set(said.flatMap((word) => searchTerm(word) ?? []))];
    }),
  );
  const phrases = new Map(
    docs.map((doc) => [
      doc.id,
      phraseKey(`${doc.page} ${doc.heading} ${doc.keywords} ${doc.text}`),
    ]),
  );
  /** Terms as a section has them in a row, for finding two of the reader's words side by side. */
  const pairs = new Map(
    docs.map((doc) => [
      doc.id,
      ` ${termsOf(`${doc.page}. ${doc.heading}. ${doc.keywords}. ${doc.text}`).join(" ")} `,
    ]),
  );

  /** How much more a section counts for holding the reader's words in its titles, or what they typed as it stands. */
  function bonus(id: string, query: string, said: readonly string[]): number {
    const title = titles.get(id);
    if (!title) return 1;
    const extra = phraseSynonyms(query);
    const covered = said.filter((word, i) => {
      if (holds(title, word) || synonymsOf(word).some((each) => holds(title, each))) return true;
      if (i === 0 && extra.some((each) => holds(title, each))) return true;
      // The last word may be unfinished.
      const key = wordKey(word);
      return (
        i === said.length - 1 && key.length >= 3 && [...title].some((term) => term.startsWith(key))
      );
    }).length;
    const phrase =
      words(query).length >= 2 && (phrases.get(id)?.includes(phraseKey(query)) ?? false);
    // Short of that, each two of the reader's words found side by side, such as "restore deleted", count.
    const saidTerms = said.flatMap((word) => searchTerm(word) ?? []);
    const together = saidTerms
      .slice(1)
      .filter((term, i) => pairs.get(id)?.includes(` ${saidTerms[i]} ${term} `)).length;
    const near = saidTerms.length < 2 ? 0 : together / (saidTerms.length - 1);
    return (1 + covered / said.length) * (phrase ? 2 : 1 + near / 2);
  }

  function run(query: string, said: readonly string[], combineWith: "AND" | "OR"): SearchResult[] {
    const own = new Set(said.flatMap((word) => searchTerm(word) ?? []));
    const extra = phraseSynonyms(query);
    const queries = said.map((word, i) => ({
      combineWith: "OR" as const,
      prefix: i === said.length - 1,
      queries: [word, ...synonymsOf(word), ...(i === 0 ? extra : [])],
    }));
    return index.search(
      { combineWith, queries },
      // The reader's own words count fully; Tonaris's words for them a little less.
      { boostTerm: (term) => (own.has(term) ? 1 : 0.6) },
    );
  }

  function rank(query: string, said: readonly string[], pages: number): HelpSearchResult[] {
    const every = run(query, said, "AND");
    const seen = new Set(every.map((result) => result.id));
    // Sections with only some of the words come after those with every word.
    const some =
      every.length >= 6 ? [] : run(query, said, "OR").filter((result) => !seen.has(result.id));
    const ranked = [
      ...every.map((result) => ({ result, weight: 1 })),
      ...some.map((result) => ({ result, weight: 0.4 })),
    ]
      .map(({ result, weight }) => ({
        result,
        score: result.score * weight * bonus(String(result.id), query, said),
      }))
      .toSorted((a, b) => b.score - a.score);
    const marks = markedTerms(query);
    const results = new Map<string, HelpSearchResult & { score: number }>();
    for (const { result, score } of ranked) {
      const doc = byId.get(String(result.id));
      if (!doc) continue;
      let page = results.get(doc.slug);
      if (!page) {
        page = { slug: doc.slug, page: doc.page, section: doc.section, hits: [], score };
        results.set(doc.slug, page);
      } else {
        // A page's other matching sections add a little.
        page.score += score * 0.1;
      }
      if (page.hits.length < 3) {
        page.hits.push({
          id: doc.id,
          heading: doc.heading,
          anchor: doc.anchor,
          snippet: snippet(doc.text, marks),
        });
      }
    }
    return [...results.values()]
      .toSorted((a, b) => b.score - a.score)
      .slice(0, pages)
      .map(({ score: _score, ...result }) => result);
  }

  return {
    search(query, pages = 8) {
      const typed = countedWords(query);
      const answer: HelpSearchAnswer = {
        results: [],
        showingFor: undefined,
        alsoLookedFor: [],
        didYouMean: undefined,
      };
      if (typed.length === 0) return answer;
      // A word a letter off one Help uses is read as that word.
      const said = correct(typed, (length) => (length >= 4 ? 1 : 0));
      const corrected = said.some((word, i) => word !== typed[i]);
      const searched = corrected ? replaceWords(query, typed, said) : query;
      answer.results = rank(searched, said, pages);
      if (answer.results.length > 0) {
        if (corrected) answer.showingFor = searched;
        const own = new Set(said.flatMap((word) => searchTerm(word) ?? []));
        answer.alsoLookedFor = [
          ...new Set([...said.flatMap(synonymsOf), ...phraseSynonyms(searched)]),
        ].filter((each) => words(each).some((word) => !own.has(searchTerm(word) ?? "")));
      }
      // A word Help doesn't use, even after that, may be two letters off one it does: offered, when the query it
      // makes finds sections with every word. The other words may have found something meanwhile.
      if (said.every((word, i) => known(word, i === said.length - 1))) return answer;
      const guess = correct(said, (length) => (length >= 5 ? 2 : length >= 4 ? 1 : 0));
      if (guess.some((word, i) => word !== said[i])) {
        const text = replaceWords(searched, said, guess);
        if (run(text, guess, "AND").length > 0) answer.didYouMean = text;
      }
      return answer;
    },
  };
}
