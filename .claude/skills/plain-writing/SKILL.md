---
name: plain-writing
description: Rewrite prose in plain, specific English without AI tells, for PR descriptions, Linear issues and comments, docs and specs. Use when writing or editing text a person will read, or when asked to make text plainer, shorter or less AI-sounding.
---

# Plain writing

The creator reads every PR, issue and spec. Write so they understand it on one read: short sentences, concrete words, the fact first. Scan a draft for the patterns below, then rewrite it, keeping the meaning.

## Say the thing

- **Lead with the fact.** "Search finds Røyksopp from 'royksopp'", not "This change improves search".
- **Name the mechanism or the number, not the feeling.** "The slowest keystroke takes 6 ms", not "search is fast". If a sentence could appear unchanged in another project's docs, it says nothing about this one: cut it.
- **Name who acts.** "The server refuses the name", not "the name is refused".
- **One idea per sentence.** If the reader has to backtrack, split the sentence.
- **Whole sentences.** Keep the articles and verbs; spell out arrows and abbreviations. "The parser rejects a bad date and writes nothing", not "bad date → reject, no write".
- **One word per concept.** Don't rotate synonyms: pick "list" and keep it.

## Cut

- **Filler:** "in order to" becomes "to", "due to the fact that" becomes "because". Delete "it is important to note that", "this PR", "basically".
- **Inflated words:** use, help, many, show, is and has instead of leverage, utilize, facilitate, numerous, showcase, serves as and boasts. Also drop comprehensive, robust, seamless, crucial, pivotal, enhance, streamline, landscape, ecosystem.
- **Hedging stacks:** "could potentially possibly" becomes "may", or a fact.
- **"Not just X, but Y"** and other framing: state Y.
- **Forced threes:** list as many items as there are.
- **-ing tails:** "…, ensuring reliability" adds nothing. Delete it, or say how.
- **Metaphors for plain things:** "surface", "wedge", "north star", "under the hood". Use the literal word.
- **Generic endings:** "This sets us up well for the future." State the plan or stop.
- **Chat phrases:** "Great question", "I hope this helps", "Let me know if".

## Punctuation and format

- No em dashes: use a period or a comma. En dashes stay in ranges (FR-07.18–FR-07.21).
- Colons before a list or an example, not as a mid-sentence hinge.
- Sentence-case headings, no emoji in headings or bullets, straight quotes.
- Bold for a few scannable lead-ins, not for every term.
- A list item that repeats its bold label ("**Speed:** Speed improved…") becomes plain prose.

*Adapted from pstack's `unslop` skill by Lauren Tan (MIT); see `../THIRD_PARTY_NOTICES.md`.*
