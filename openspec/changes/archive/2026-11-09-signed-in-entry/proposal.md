# Proposal

Linear: TON-185 (Feature). Adjusts the landing page (DS-120, TON-155) and sign-in (DS-90). Done when a signed-in visitor to `/welcome` is offered Open Tonaris instead of Sign in, a signed-in visit to `/sign-in` goes on into the app, the server still renders one landing page for everyone, and an AI client's sign-in still shows the form.

## Why

In manual testing on 9 November 2026, the creator noticed the landing page's Sign in buttons don't know whether the visitor is already signed in. Signed-in people do reach `/welcome`: through the guest page's wordmark, links passed on, or to look at it. Only `/` sends them on. Sign in opened `/sign-in`, which didn't check either, so they got the email form again, and filling it in only made a second session.

## What Changes

- **The landing page:** once the browser learns the visitor is signed in (`GET /v1/me`), its three Sign in buttons (header, hero, close) become **Open Tonaris**, leading to `/` and so to the person's last view. The close's sentence about signing in changes to match.
  - The server renders the same page for everyone, with Sign in. Crawlers, link previews and caching are unaffected; a signed-in visitor sees Sign in for a moment.
- **`/sign-in`:** a signed-in person is sent on, replacing the page in history: to the page asked for (`redirect`, through `safeRedirect`), or else to `/`. This covers guest pages' Sign in link and bookmarks too.
  - **An AI client's sign-in stays on the form** (a `redirect` to `/oauth/…`), because the client may have asked for a fresh sign-in (`prompt=login`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `landing-page`: a signed-in visitor is offered Open Tonaris.
- `accounts`: the sign-in page sends someone already signed in on.

## Impact

- **`apps/web`:** `features/account/session.ts` (`useSignedIn`), `features/landing/landing-page.tsx`, `routes/sign-in.index.tsx`; browser tests in `e2e/landing.e2e.ts`, and `e2e/app-shell.e2e.ts`'s axe check of `/sign-in` while signed in, now left to `sign-in.e2e.ts`.
- **Docs:** DS-120 and DS-90 as built.
- No API, data or sync change.
