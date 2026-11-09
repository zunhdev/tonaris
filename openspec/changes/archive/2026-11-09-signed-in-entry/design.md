# Design

## Context

- `/welcome` and `/sign-in` are rendered on the server and public. The server doesn't know who is signed in; the session cookie is the API's, and only the API decides. `start.ts` reads only the cookie's name, to send a signed-out `/` to `/welcome`.
- The workspace asks `GET /v1/me` in the browser (`currentAccount`), which keeps a loaded account for the page.

## Decisions

### 1. Ask in the browser, after the page shows

The landing page and the sign-in page call `currentAccount()` in an effect. The server's HTML stays one page for everyone, so crawlers, link previews and any cache see the same thing, and nothing about a session is read on the server. The cost is a moment of Sign in for a signed-in visitor, who is rare on these pages. Reading the cookie's name on the server would avoid that, but a stale cookie would then show Open Tonaris to someone signed out, and the page would differ per visitor.

### 2. Open Tonaris leads to `/`

`/` already goes to the person's last view (DS-32), so the landing page needn't know it.

### 3. The sign-in page replaces itself

`router.history.replace`, so Back doesn't return to a form the person has no use for. The target is `safeRedirect(redirect)` when one was asked for, the same checks a sign-in passes, or else `/`.

### 4. An AI client's sign-in is left alone

The authorization server sends the person to `/sign-in?redirect=/oauth/authorize?…`. A client that asked for `prompt=login` wants a fresh sign-in, which the continuation drops once the person has signed in (`authorizeContinuation`). Sending a signed-in person straight on would skip it, so that path keeps the form.

## Risks / Trade-offs

- [The API can't be reached] → `useSignedIn` stays false and the sign-in page stays; both are as before.
- [Signing out lands on `/sign-in`] → the account is forgotten before the navigation, so the page asks again and gets a 401.
