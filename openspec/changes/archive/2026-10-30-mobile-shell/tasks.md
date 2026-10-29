# Tasks

## 1. Shell and header

- [x] 1.1 Drop the sidebar below 768 px, and give `PageHeader` the phone's top bar with `back`, Search and a compact Account menu (design decision 1). Pass `back` from every view.

## 2. Screens

- [x] 2.1 Add the root screen's Unsorted and Shared with me (design decision 2).
- [x] 2.2 Make the rows 56 px and 48 px with the phone's columns (design decision 3).
- [x] 2.3 Make the inspector a sheet and view options a bottom sheet, and add the desktop-only messages (design decision 4).

## 3. Tests and docs

- [x] 3.1 Add `pixel` and `iphone` projects and `e2e/mobile.e2e.ts`: drilling down and back, rows, the album sheet, the bottom sheet, desktop-only screens, search, and axe (design decision 5).
- [x] 3.2 Record DS-110 as built.
- [x] 3.3 Run `bun run check`, `test:e2e:webkit` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
- TON-94 closes once the creator has run Firefox.
