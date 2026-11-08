# Tasks

## 1. The finder

- [x] 1.1 `ListFinder` from `add-to-list.tsx`, with an optional no-list option and a chosen mark; verified by the existing "Add to a list" browser test

## 2. The List field

- [x] 2.1 `ListField`: a combobox button with the chosen path, opening a popover with `ListFinder`, in "Add albums" and "New album"; verified by a browser test: the field's path, the popover's focus and "No list" first, a typed word finding a list, Enter choosing it and closing only the popover, Esc keeping the dialog, the capture going to the list chosen, "Enter manually" keeping it, and axe

## 3. Docs and checks

- [x] 3.1 DS-47 and DS-48 as built in TON-181
- [x] 3.2 `bun run check` passes

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
