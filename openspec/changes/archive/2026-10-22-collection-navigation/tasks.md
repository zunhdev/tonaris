# Tasks

## 1. Domain: shared name refusals

- [x] 1.1 Export `containerNameProblem(name)` and `nameTakenProblem(takenName, parentName)` from `packages/domain/src/containers.ts`, used by its commands and by the client (design decision 3). Verify with the domain tests, unchanged in behavior, and a test for each export.

## 2. The tree's model and the stores

- [x] 2.1 Add `features/collection/tree.ts` with `buildTree`, `visibleRows`, `ancestorsOf`, `albumCounts`, `unsortedCount` and `typeAhead` (design decision 1). Verify with `tree.test.ts`:
  - children in creation order;
  - visible rows with level, position and set size;
  - ancestors;
  - counts, Unsorted being albums in no list;
  - type-ahead ignoring case and accents, wrapping around (spec: type-ahead).
- [x] 2.2 Add the editing store `features/collection/editing.ts`, with where a new item goes and the checks before sending, and the device storage helpers for expansion, the last view and the sidebar (design decisions 3, 5 and 8). Verify with `editing.test.ts`:
  - where N and ⇧N create, from a focused item and from a view;
  - a blank, overlong or sibling-taken name is refused with the domain's text (spec: a taken name is caught before sending);
  - last-view paths are accepted only for collection views.
- [x] 2.3 Add `features/shell/shortcuts.ts`, the key matcher (design decision 7). Verify with `shortcuts.test.ts`:
  - G then U matches, and a pause over 1.5 s doesn't;
  - keys typed in a text field are ignored (spec: shortcuts wait while typing);
  - modifiers other than Shift are ignored.

## 3. Interface

- [x] 3.1 Add `Dialog` to `packages/ui` on Base UI. Verify with `bun run typecheck` and the shortcut reference's browser test.
- [x] 3.2 Build the shell (design decisions 2, 7 and 8):
  - the resizable, hideable sidebar;
  - the tree with keyboard navigation, counts, selection, expansion and the save-state pieces;
  - the "+" menu;
  - the inline editor;
  - shortcuts and the shortcut reference, with the account menu's entry.

  Verify with the browser tests in group 4.
- [x] 3.3 Add the routes and views (design decisions 4, 5 and 9): `/c`, `/f/$folderId`, `/l/$listId`, `/unsorted`, `/trash`, `/shared`, `/` under the workspace remembering the last view, breadcrumbs, titles, summaries and empty states. Verify with the browser tests in group 4.
- [x] 3.4 Add Edit to `SaveActions`, in toasts, Activity and batch report items (design decision 6). Verify with the browser tests in group 4.

## 4. Browser tests

- [x] 4.1 Add e2e accounts and `e2e/collection-navigation.e2e.ts`, covering the specs in the browser:
  - by keyboard alone:
    - ⇧N "Metal", N "Doom" inside it, and F2 to rename it;
    - arrows, → and ←, type-ahead, and Enter opening the list;
    - breadcrumbs "Collection › Metal", the heading, the title, and the item selected;

    (specs: creating a folder and a list in it; renaming; walking the tree; type-ahead; breadcrumbs; nested folders and lists);
  - expansion and the sidebar's width survive a reload, and `[` hides and shows the sidebar (specs: expansion is remembered; resizing by keyboard);
  - G U and G H, and "g u" typed in a name field doing nothing else (specs: going to Unsorted; shortcuts wait while typing);
  - `?` opens the reference;
  - a taken name keeps the editor open with the reason (spec: a taken name is caught before sending);
  - a list opened by `/f/…` lands on `/l/…`, a missing ID shows it isn't available, and `/` returns to the last view (specs: a list opened by a folder path; a missing folder; back where they were);
  - a create rejected by the server offers Edit, which saves under a new name (spec: editing a rejected name);
  - offline, the "+" menu says "You're offline" (spec: offline);
  - list and Unsorted counts follow albums added through the client (spec: nested folders and lists);
  - axe finds no violations in the sidebar with the tree, nor in the shortcut reference.
- [x] 4.2 Update `app-shell.e2e.ts`: the root's DS-105 empty state replaces "Your collection is empty" (spec: an empty collection). Verify the file passes.

## 5. Specs and integration

- [x] 5.1 Update the specs for what is built. Verify the text matches the implementation.
  - `docs/design-spec.md`: DS-27, DS-30, DS-31, DS-32, DS-78 and DS-105, as built in TON-33.
  - `docs/tech-spec.md`: TS-03 (`/` is client-only, under the workspace).
- [x] 5.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 5.3 Run `openspec validate collection-navigation --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that `openspec/specs/app-shell/spec.md` and `openspec/specs/collection-hierarchy/spec.md` gain the new requirements after the archive, and that `openspec validate --all --strict` passes.
