# Tasks

## 1. Getting there

- [x] 1.1 A session-cookie check (`features/landing/session-cookie.ts`) with unit tests for both cookie names
- [x] 1.2 `start.ts` answers a cookieless `GET /` with a redirect to `/welcome`; the workspace sends a signed-out `/` there too
- [x] 1.3 `/welcome`, rendered on the server, with its title and description

## 2. The page

- [x] 2.1 Landing sizes `hero`, `headline`, `lead` and `body` in `tokens.css` and `text-sizes.ts`
- [x] 2.2 The ten invented albums and their set 1 covers as inline SVG, grain from 64 px
- [x] 2.3 The workspace picture: sidebar, rows grouped by release type, inspector; narrower screens drop parts
- [x] 2.4 Header, hero, How it works, What sets it apart, On your phone, the short row, the closing Sign in and the footer

## 3. Sign-in and guest pages

- [x] 3.1 The sign-in card loses the promo; its wordmark links to `/welcome` on signed-out pages; `promo.tsx` goes
- [x] 3.2 The guest page's wordmark links to `/welcome`

## 4. Checks

- [x] 4.1 `e2e/landing.e2e.ts`: the redirect, the server-rendered page, a signed-in `/`, Sign in and back, axe at desktop and phone widths (all scenarios); `promo.e2e.ts` goes
- [x] 4.2 Look at the page in a browser at desktop and phone widths

## 5. Docs

- [x] 5.1 DS-120 (new), DS-90, DS-72, DS-32, DS-13, the design decisions log and TS-03 as built
- [x] 5.2 Run `bun run check`

## Workflow follow-up

- Archive the change as the PR's last commit.
