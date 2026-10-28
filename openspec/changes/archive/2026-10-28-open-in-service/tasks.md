# Tasks

## 1. Spike

- [x] 1.1 Verify the desktop apps' schemes and album routes, and write `docs/spikes/2026-10-28-desktop-app-links.md`. Verify the report states what was and wasn't checked.

## 2. Opening

- [x] 2.1 Add `appLink()` (design decision 1). Verify with unit tests: an album and a track of each service, Apple's storefront kept, and unparseable input.
- [x] 2.2 Add the chooser and its provider, and `PopoverContent`'s anchor (design decision 2).
- [x] 2.3 Add the rows' services column and Open button, and `O` (design decisions 3 and 4). Verify `O` with the shortcut matcher's test.

## 3. End to end

- [x] 3.1 Verify AC-18 with Playwright (`open-in.e2e.ts`):
  - on desktop, the Open button lists only the linked services, in order, with their pages in new tabs and their app links (specs: two links; desktop);
  - a single link still asks (spec: one link);
  - `O` with no links says so (spec: no links);
  - the app message after 2 s with focus kept (spec: the app didn't take over);
  - on a phone-sized touch screen, a bottom sheet of canonical links without App (spec: mobile).

## 4. Docs

- [x] 4.1 Update TS-43 as built, and DS-21, DS-25 and DS-78. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run the full `bun run check`, including `bun test` and `bun run test:e2e`, and verify it passes locally.
- [x] 5.2 Run `openspec validate open-in-service --strict` and verify it passes.

## Workflow follow-up

- Archive the change with `/opsx:archive` as the PR's last commit, after implementation and checks pass, and say so in the PR body.
- Verify that the archive updates `service-links`, and that `openspec validate --all --strict` passes.
