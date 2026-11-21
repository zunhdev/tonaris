// A search result's snippet (DS-122, the creator's picks 3A and 3C): a little of what its section says, with the
// words that matched marked, and its keys as this computer labels them, as Help's pages show them (keys.tsx).

import type { ReactNode } from "react";

import { keyLabel, useApple } from "../keys";
import type { SnippetPart } from "./engine";

/** The marks the search's matches and a page's marked words share: the accent at 30%. */
export const markClass = "rounded-sm bg-accent-solid/30 text-fg-primary";

const modifier = /[⌘⌥⇧⌫]/gu;

/** Each part with where it starts in the snippet, which keys it. */
function placed(parts: readonly SnippetPart[]) {
  let at = 0;
  return parts.map((part) => {
    at += part.text.length;
    return { part, key: `${at - part.text.length}` };
  });
}

export function Snippet({ parts }: { parts: readonly SnippetPart[] }) {
  const apple = useApple();
  return placed(parts).map(({ part, key }): ReactNode => {
    const text = apple
      ? part.text
      : part.text.replaceAll(modifier, (symbol) => keyLabel(symbol, false));
    return part.hit ? (
      <mark key={key} className={markClass}>
        {text}
      </mark>
    ) : (
      <span key={key}>{text}</span>
    );
  });
}
