# Tasks

## 1. Pure rules

- [x] 1.1 Add `features/collection/order.ts`: `sortYear`, `chronological` and `yearLabel` (design decision 2). Verify with `order.test.ts`:
  - live albums sort by recording year, and others by original year;
  - unknown years come last;
  - ties go by title, ignoring case and accents, then by ID;
  - labels for a year, a live range and an unknown year

  (spec: a list's albums).
- [x] 1.2 Add `features/collection/grid-keys.ts`, the key map for the grid pattern (design decision 5). Verify with `grid-keys.test.ts`:
  - arrows without wrapping;
  - J and K;
  - Home and End;
  - ⌘Home and ⌘End;
  - Page Up and Page Down;
  - clamping to a short last row of cards

  (spec: walking the grid of cards; rows by keyboard).
- [x] 1.3 Add the artwork tile's hue and letter (design decision 3), in `artwork-tile.ts`. Verify with a Bun test: the same title gives the same hue, the letter is the first grapheme upper-cased, and an empty title gives a neutral tile (spec: no artwork yet).

## 2. Interface

- [x] 2.1 Extend `CollectionData` with the albums by ID, each list's entries and Unsorted's albums, and add `viewLayouts` to `device.ts` (design decisions 1 and 7). Verify with `bun run typecheck` and the browser tests in group 3.
- [x] 2.2 Build the `Artwork` component, album rows, album cards, folder and list rows, the virtualized grids with `useGridKeys`, the layout switch in the header, and the views' bodies (design decisions 3–7). Wire in the save-state marker, `aria-busy` and the highlight. Add J and K, and the grid keys, to the shortcut reference. Verify with the browser tests in group 3.

## 3. Browser tests

- [x] 3.1 Add e2e accounts and `e2e/collection-views.e2e.ts`, covering the specs in the browser:
  - a list's albums in chronological order, with artist, year and type, and Unsorted holding the album in no list (specs: a list's albums; Unsorted);
  - Grid kept after a reload for that list only (spec: switching to the grid);
  - a folder's rows with counts, J and Enter opening the next (specs: a folder's contents; rows by keyboard);
  - cards walked with → and ↓ (spec: walking the grid of cards);
  - every album showing its tile (spec: no artwork yet);
  - a rename from another session updating a row in place;
  - 5,000 albums in Unsorted: `aria-rowcount`, a few dozen rows rendered, ⌘End reaching the last, in Rows and in Grid (spec: 5,000 albums);
  - axe finding no violations in either layout.
- [x] 3.2 Run the 5,000-album scroll measurement once with `MEASURE_SCROLL=1` (design decision 8) and keep its numbers for the PR. Verify both layouts stay smooth: the median frame near 16.7 ms, and few frames over 50 ms.

## 4. Specs and integration

- [x] 4.1 Update `docs/design-spec.md` for what is built: DS-21, DS-22, DS-23, DS-40, DS-41 and DS-78 as built in TON-34. Verify the text matches the implementation.
- [x] 4.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 4.3 Run `openspec validate collection-views --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/views-and-ordering/spec.md` is created and `app-shell` updated by the archive, and that `openspec validate --all --strict` passes.
