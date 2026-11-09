# Tasks

## 1. The browser asks

- [x] 1.1 `useSignedIn()` in `features/account/session.ts`: false until `currentAccount()` answers, and on failure
- [x] 1.2 The landing page's header, hero and close offer Open Tonaris to `/` when signed in, with the close's sentence to match; verified by `landing.e2e.ts` (signed in), including the server's HTML still offering Sign in, and axe
- [x] 1.3 `/sign-in` replaces itself with `safeRedirect(redirect)` or `/` when signed in, except for an `/oauth/` continuation; verified by `landing.e2e.ts` (signed in)

## 2. Docs and checks

- [x] 2.1 DS-120 and DS-90 as built in TON-185
- [x] 2.2 `bun run check` passes, and a native `bun run build`

## Workflow follow-up

- Archive the change as the PR's last commit, then `bun run check:specs`.
