# Tasks

## 1. Choices and matching

- [x] 1.1 `listChoices`, `suggestions`, `findLists` and `matchedParts` in `list-picker.ts`; verified by unit tests: the album's own lists left out, recent first then by path, 8 at most with the rest counted, every word in the path, name tiers first, 50 at most, and the marked parts

## 2. The dialog

- [x] 2.1 "Find a list" as a combobox over grouped options, Enter and click adding, notes for the rest, no matches and too many; verified by a browser test: the focus, Recent and its count, a folder word and a name word finding a list, ↓ and Enter adding it, a fresh field on reopening, no matches, and axe

## 3. Docs and checks

- [x] 3.1 DS-46 as built in TON-177
- [x] 3.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
