# Tasks

## 1. Rules

- [x] 1.1 Extend `album-edit.ts` with the `originalYear` and `recording` fields and `albumChoice()` (design decision 3). Verify with `album-edit.test.ts`: each field's format and requirement; Live off without an original year refused (spec: Live off without an original year); the release type saved.
- [x] 1.2 Add `album-form.ts`, with `formProblems()` and `albumOfForm()` (design decision 5). Verify with `album-form.test.ts`:
  - title and artist required;
  - the applicable year for studio and live albums;
  - year and range formats;
  - the built album, with nothing invented

  (spec: required information).

## 2. Inspector

- [x] 2.1 Add the `album` search parameter, `useInspector()`, the inspector pane in the shell, opening from rows and cards, following the grid's focus, and closing with Esc (design decision 1). Verify with the browser tests in group 5.
- [x] 2.2 Build `AlbumDetails` and its sections, the editors in Editing mode, a `Switch` in `packages/ui`, and the `/a/$albumId` route (design decisions 2, 3 and 6). Verify with the browser tests in group 5.
- [x] 2.3 Build the lists section: removing with Undo, `AddToListDialog`, and L (design decision 4). Add L, Enter and Esc to the shortcut reference. Verify with `shortcuts.test.ts` and the browser tests in group 5.

## 3. Manual entry

- [x] 3.1 Build `NewAlbumDialog`, its entry points (the sidebar, "+ Add album" in lists, Edit on a failed create) and the discard confirmation (design decision 5). Verify with the browser tests in group 5.

## 4. Specs

- [x] 4.1 Update `docs/design-spec.md` for what is built: DS-30, DS-32, DS-46, DS-47 and DS-78, as built in TON-38. Verify the text matches the implementation.

## 5. Browser tests and integration

- [x] 5.1 Add e2e accounts and `e2e/album-inspector.e2e.ts`, covering the specs in the browser:
  - opening by click with `?album=`, J moving it, and Esc closing it (specs: opening an album; moving through albums);
  - Editing mode: a live recording range shown in two lists, and Live off refused (specs: a live album in the inspector; Live off without an original year);
  - removing from the only list with Undo, and adding with L (spec: taking an album out of its only list);
  - the form: required information reported, saving into the current list, and Esc asking first (specs: required information; into a list; unsaved input is kept);
  - `/a/{id}` (spec: an album's own page);
  - axe finding nothing in the inspector and the form.
- [x] 5.2 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 5.3 Run `openspec validate album-inspector --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `album-records` and `app-shell`, and that `openspec validate --all --strict` passes.
