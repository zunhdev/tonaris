# Tasks

## 1. Rules

- [x] 1.1 Add `features/collection/album-edit.ts`, with `albumEdit()` and the year rules (design decision 6). Verify with `album-edit.test.ts`:
  - title and artist trimmed, and refused when blank;
  - non-live year required;
  - a live recording year or range set together, any dash;
  - blank clearing a live recording year only with an original year;
  - the fallback editing the original year;
  - the format and backwards-range refusals;
  - unchanged values sending nothing

  (specs: a live album's recording range; a refused year).

## 2. Modes

- [x] 2.1 Add the mode to `CollectionUi`, with `setMode`, `enterEditing`, the device key and the narrow-screen rule; and the inline-editor registry that leaving commits (design decisions 1 and 2). Register the tree's name editor in it. Verify with the browser tests in group 4.
- [x] 2.2 Add `ModeSwitch` and the header tint to the collection views, and E to the shortcut matcher and reference (design decision 4). Call `enterEditing()` from `useStartEditor`, M and tree drops (design decision 3), and gate the drag handles to Editing (design decision 5). Verify with `shortcuts.test.ts` and the browser tests in group 4.

## 3. Inline album cells

- [x] 3.1 Build the inline cells in album rows: Enter, double-click and F2, saving and refusals, keeping the edited row rendered, registering with the registry, offline, and grid keys leaving text fields alone (design decision 6). Verify with the browser tests in group 4.

## 4. Browser tests

- [x] 4.1 Add e2e accounts and `e2e/editing-modes.e2e.ts`, covering the specs in the browser:
  - Viewing by default, and Editing kept after a reload (specs: Viewing by default; kept on the device);
  - E switching, with the header's choice and tint, and no request sent (specs: switching with E; switching modes sends nothing);
  - N in Viewing switching to Editing with its announcement (spec: a new list while viewing);
  - a valid rename saved on leaving, and a cleared title blocking E with its error (specs: a valid edit is saved; an invalid edit blocks leaving);
  - retitling with Enter, a live range, and a refused year (specs: retitling an album; a live album's recording range; a refused year);
  - no handles in Viewing, ⌥↑ still working, and handles in Editing (spec: no handles while viewing);
  - axe finding nothing in Editing with a cell open.
- [x] 4.2 Update TON-36's drag test to switch to Editing first. Verify that `bun run test:e2e` passes.

## 5. Specs and integration

- [x] 5.1 Update `docs/design-spec.md` for what is built: DS-21, DS-45, DS-49 and DS-78, as built in TON-37. Verify the text matches the implementation.
- [x] 5.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 5.3 Run `openspec validate editing-modes --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `views-and-ordering`, `album-records` and `app-shell`, and that `openspec validate --all --strict` passes.
