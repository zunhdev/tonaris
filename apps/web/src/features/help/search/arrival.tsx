// Arriving at a page from Help's search (FR-16.4, DS-122, the creator's pick 3A): the result opens its page at the
// section it found, with `?hl=`, what was searched for, and the page marks each place in its text where the reader's
// words appear, or where Tonaris's words for them do when theirs don't ("list" for "playlist"). Its title, summary
// and the links around it stay unmarked. Marked through CSS's Custom Highlight API, which marks text without changing
// the page; a browser without it shows the page unmarked. Rendered with the page's content, which loads after a move
// from another page, so it also brings the section into view once the section is there.

import { useEffect } from "react";

import { isMarked, markedTerms } from "./terms";

const highlightName = "help-search";
const wordPattern = /[\p{L}\p{N}]+(?:['’]\p{L}+)?/gu;

/** The page's own header, and the links around its text, which aren't marked. */
const unmarked = "header, nav, section[aria-labelledby='related']";

/** Each place in `root`'s text where a word marked for `query` appears. */
function rangesOf(root: HTMLElement, query: string, alternatives: boolean): Range[] {
  const marks = markedTerms(query, alternatives);
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(unmarked)) continue;
    for (const match of (node.textContent ?? "").matchAll(wordPattern)) {
      if (!isMarked(match[0], marks)) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      ranges.push(range);
    }
  }
  return ranges;
}

export function SearchArrival({
  rootId,
  query,
  hash,
}: {
  /** The element whose text is marked. */
  rootId: string;
  /** What was searched for. */
  query: string | undefined;
  /** The section to bring into view, without its `#`. */
  hash: string;
}) {
  useEffect(() => {
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, [hash]);
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!query || !root || !("highlights" in CSS)) return undefined;
    const own = rangesOf(root, query, false);
    const ranges = own.length > 0 ? own : rangesOf(root, query, true);
    CSS.highlights.set(highlightName, new Highlight(...ranges));
    return () => {
      CSS.highlights.delete(highlightName);
    };
  }, [rootId, query]);
  return null;
}
