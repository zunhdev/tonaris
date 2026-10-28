# Tasks

## 1. Domain

- [x] 1.1 Add `searchTier` and `matchRange` beside `searchKey` (design decision 1). Verify with bun tests: the normalize fixtures' search cases, tiers, and highlight ranges for "Björk" (composed and decomposed), "Straße", "ﬁve" and whitespace runs.

## 2. Index

- [x] 2.1 Add `buildSearchIndex` and `search` in `features/search/search-index.ts` (design decision 2). Verify with bun tests: groups and totals, tier order, album ranking by title or artist, locations ("Collection", "Metal › Doom", "+1 more", "Unsorted"), descriptions not matched, and build plus query within 50 ms at 5,000 albums.

## 3. Palette

- [x] 3.1 Add `CommandDialog` to `packages/ui` (design decision 3). Verify in the palette's browser tests.
- [x] 3.2 Add the palette, ⌘K in the matcher and the shell, the sidebar's Search item, and ⌘K in the shortcut reference (design decisions 3 and 4). Verify with the matcher's bun tests and Playwright (`search.e2e.ts`):
  - ⌘K from a text field, and the sidebar item;
  - groups, locations and highlighting;
  - opening a list, an album with the inspector, and an album on its own with ⌘Enter;
  - "Show all";
  - Trash and descriptions not matched;
  - full screen on a narrow viewport;
  - no axe violations.

## 4. Docs

- [x] 4.1 Record DS-75, DS-78, DS-20's palette row and TS-50 as built, with the creator's decisions of 28 October 2026. Verify the text matches the implementation.

## 5. Checks

- [ ] 5.1 Run `bun run check`, and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
