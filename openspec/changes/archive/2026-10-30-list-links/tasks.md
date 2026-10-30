# Tasks

## 1. Links

- [x] 1.1 Add `ServiceNames` in `features/open/`: ordered `ServiceAnchor`s, pointer-only, with no focus and no inspector (design decision 1). Verified by 2.1.
- [x] 1.2 Cards: a line of `ServiceNames` under the year, with `textHeight` at 88 (design decision 2). Verified by 2.1.
- [x] 1.3 Rows: the services column renders `ServiceNames` (design decision 1). Verified by 2.1.

## 2. Tests and docs

- [x] 2.1 `e2e/open-in.e2e.ts`: a card reads "Spotify · Tidal" and a row "Spotify, Tidal", each a link to its page. A click opens the page in a new tab, and the inspector stays closed.
- [x] 2.2 Record DS-21, DS-22 and DS-25 as built in TON-105.
- [x] 2.3 Run `bun run check` and a native `bun run build`.

## Workflow follow-up

- Archive the change as the PR's last commit.
