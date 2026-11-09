# Tasks

## 1. The rows

- [x] 1.1 On a phone, `ContainerRows` has one column, its rows are 56 px, and each row's link fills it, holding the icon, the name with its save state, and a second line with the count and the description's first line; verified by the phone test in `mobile.e2e.ts`
- [x] 1.2 The link is labelled by its name and described by the second line; verified by the phone test and axe

## 2. Docs and checks

- [x] 2.1 DS-110 and DS-41 as built in TON-184
- [x] 2.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
