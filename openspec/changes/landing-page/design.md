# Design

## Context

- `/` is the workspace's index route, client-only (TS-03). It reads the device's last view and redirects there. Signed out, the workspace's `beforeLoad` sends every path, `/` included, to `/sign-in`.
- The session cookie is set by the API with the `tonaris` prefix, `__Secure-tonaris.session_token`, or `tonaris.session_token` where cookies aren't secure (WebKit's e2e run). Its domain is the parent of the web app's host (TS-08), so the web server receives it too.
- Start's request middleware (`src/start.ts`) adds the security headers; a request middleware may answer with its own `Response`.
- The CSP's `style-src` has a nonce and no `'unsafe-inline'`, so a server-rendered page can't carry `style` attributes.
- The sketches the creator chose are on the canvas "Tonaris landing page": artboards "1b · Refined" and "Cover sets 1–3" (set 1).

## Goals / Non-Goals

**Goals:** a landing page that reads as the product, rendered on the server; signed-out visitors to `/` see it, signed-in people don't notice it exists.

**Non-Goals:** a light theme, translations, an Open Graph image, analytics, a request-an-invitation form.

## Decisions

### 1. `/welcome`, reached by a redirect from `/`

`/` stays the workspace index, so the last-view redirect (DS-32) is untouched. Two paths send signed-out visitors to `/welcome`:
- **On the server:** a request middleware answers `GET /` without a session cookie with a `302` to `/welcome` (keeping any query), `cache-control: no-store`. So a first visit, a crawler and a link preview get the rendered landing page, not an empty shell.
- **In the browser:** the workspace's `beforeLoad` sends a signed-out `/` to `/welcome` instead of `/sign-in`. That covers an expired cookie, which passes the server's check, and client-side navigation to `/`.

The middleware only looks for the cookie's name; the API still decides who is signed in. Other signed-out paths still go to `/sign-in` with their redirect.

Alternatives: rendering the landing page at `/` itself, with a client-side redirect for signed-in people (they would see it flash); asking the API from the web server (a round trip on every visit, and the web server isn't meant to hold sessions, TS-03).

### 2. The page is static markup in the app's tokens

The page and its pictures are server-rendered React with Tailwind classes on the semantic tokens, no `style` attributes (CSP), no client state. The workspace picture is drawn from the app's parts as they look (sidebar rows, album rows grouped by release type, the inspector), not a screenshot, so it stays sharp, themed and small. Each picture is `role="img"` with a label, so screen readers hear one sentence rather than the mock's text.

On narrow screens the workspace picture drops the inspector, then the sidebar, then the artist and services columns, like the app's compact rows.

### 3. Covers are inline SVG, with grain only where it shows

Ten invented albums, drawn in set 1, "Label series": a flat ground, one geometric motif, the artist and title in Inter at the top left and a catalogue number (TN 001–010) in the mono stack. Inline SVG uses the page's fonts, so the covers need no font files. The colors are artwork's own (DS-04), not tokens.

A fine grain (`feTurbulence`, overlay) is drawn from 64 px up; at row size it is invisible and costs a filter per cover. Filter IDs come from `useId`, so repeated covers don't collide.

### 4. Landing sizes as tokens

`hero` (fluid 42–80 px), `headline` (30–48 px), `lead` (18 px) and `body` (15 px) join DS-13 in `tokens.css` and `text-sizes.ts`. The app's own scale stays as it is.

### 5. The sign-in card goes back to one column

The promo and its layout go. The wordmark above the card links to `/welcome` on the pages a signed-out visitor reaches (sign-in, join, recovery help, recovery, account deleted), and on guest pages; approvals, connection consent and the agreement screen keep it plain.

## Risks / Trade-offs

- **[A stale cookie skips the server redirect]** → The browser redirect catches it, after the shell loads.
- **[The picture drifts from the app]** → It is drawn from the same tokens and row sizes; DS-120 lists what it shows, so a visible change to the shell is a reminder.
- **[Many SVG filters]** → Grain only from 64 px: on the page that's the inspector cover and the How it works cover.
