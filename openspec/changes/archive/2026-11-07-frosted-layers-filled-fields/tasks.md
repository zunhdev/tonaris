# Tasks

## 1. Tokens

- [x] 1.1 `bg.frosted` and `bg.field` in `tokens.css`; verified by `tokens.test.ts`: their values, text on the frosted ground over white at 4.5:1, and text in a field on the panel, a dialog and the app at 4.5:1

## 2. Components

- [x] 2.1 Menus, popovers, the palette, tooltips and toasts use the frosted ground with a background blur; verified by a browser test reading the account menu's and the palette's styles
- [x] 2.2 The shared control class fills fields with `bg.field`, edged `border.subtle`, `border.strong` on hover; verified by a browser test on the sign-in page's field at rest and under the pointer

## 3. Docs and checks

- [x] 3.1 DS-12, DS-14, DS-16 and DS-20 as built in TON-168, and the design decisions log
- [x] 3.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
