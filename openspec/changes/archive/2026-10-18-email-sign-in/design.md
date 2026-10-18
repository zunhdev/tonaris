# Design

## Context

- The API (`apps/api`) is an Elysia 2 beta app with `/v1/health`, the problem-details plugin and a committed OpenAPI document. Nothing resolves a principal yet. `packages/db` has the base tables, whose owner, account, person, grantee and viewer columns are `uuid` columns without foreign keys; the comment on TON-9 asks for these foreign keys to arrive with the `user` table.
- The web app (`apps/web`) has a server-rendered `/sign-in` placeholder and the client-only `_workspace` layout. The browser does not call the API yet. `src/api.ts` holds the Eden client.
- Better Auth 1.7.10 was probed on 18 October 2026, in a scratch directory, against the local Postgres with Drizzle 1.0 RC 4 and Elysia 2.0.0-beta.32:
  - The Drizzle adapter accepts camelCase keys over snake_case columns.
  - `generateId` can return `Bun.randomUUIDv7()`, so user and session ids are UUIDv7 `uuid` columns (TS-10).
  - The core `account` table is **required**: without it every endpoint fails with "Drizzle schema mismatch", even though email OTP never writes to it.
  - With `disableSignUp`, a code request for an unknown address answers `{ success: true }` and sends nothing, and a sign-in for it fails like a wrong code.
  - `storeOTP: "hashed"` works. A used code fails.
  - `advanced.cookiePrefix: "tonaris"` with `useSecureCookies` yields `__Secure-tonaris.session_token` with a 30-day Max-Age, HttpOnly, Secure and Lax.
  - A `hooks.before` middleware can rewrite `body.email` before the plugin sees it.
  - `getSession({ returnHeaders: true })` returns the renewed `Set-Cookie` when the session rolls.
  - Better Auth's `name` field can be mapped onto a nullable `display_name` column.
  - Mounting Better Auth's handler at the root of Elysia (`.mount(handler)`) swallows every unknown path, including `/v1/...` 404s. `.all("/auth/*", { parse: "none" }, …)` keeps the body intact, gets CORS headers, and leaves other 404s to the problem plugin.
  - nodemailer 10 sends to Mailpit under Bun. Mailpit's API (`/api/v1/search`, `/api/v1/message/{id}`) returns the text body, and `DELETE /api/v1/search` clears messages by recipient.
- Creator decision of 18 October 2026: the TS-104 sign-in limits are approved as proposed.

## Goals / Non-Goals

**Goals:**

- Production-shaped sign-in from day one: the same cookie, CORS and origin rules locally as in production (TS-06), with no sign-in path that a later issue has to replace.
- One place resolves the principal (TS-30), so M2 routes only declare that they need a signed-in person.
- Every spec scenario is covered: API integration tests against Postgres, and Playwright for the browser flows.

**Non-Goals:**

- Admission invitations, registration and pausing (TON-24, M8): no code path creates an account except the creator seed.
- The provider choice, the job queue and template polish for email (TON-73, TS-90): sending is direct SMTP in the background.
- The CSRF content-type rule, the bearer-ignores-cookies rule and the CSP (TON-10). Only the CORS allowlist that cross-origin sign-in needs is added here.
- Display-name editing and the rest of the account menu (Settings, Admin, shortcuts): TON-76 and M8.
- Native-app tokens and MCP OAuth (TON-22).

## Decisions

**1. Better Auth behind an allowlisted `/auth/*` route.**

- `apps/api/src/auth/auth.ts` builds the instance:
  - `basePath: "/auth"`, `baseURL: API_ORIGIN`, `trustedOrigins: [WEB_ORIGIN]` (Better Auth's own origin check on cookie requests);
  - the Drizzle adapter on the app's database;
  - `emailOTP({ disableSignUp: true, otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: "hashed" })`;
  - `session: { expiresIn: 30 days, updateAge: 1 day }`;
  - `user.fields.name → displayName`, and `role` as an additional field with `input: false`;
  - `advanced`: `cookiePrefix: "tonaris"`, `useSecureCookies: true`, `crossSubDomainCookies` when a cookie domain applies (decision 3), `database.generateId: () => Bun.randomUUIDv7()`, `ipAddress.disableIpTracking: true` (no IPs stored in sessions; the limiter in decision 4 keeps them in memory only), and a `backgroundTasks` handler so email sending never delays or fails a response;
  - `telemetry: { enabled: false }`, so no usage data leaves the server;
  - `rateLimit: { enabled: false }`: decision 4 replaces it.
- The Elysia plugin routes only `POST /auth/email-otp/send-verification-otp`, `POST /auth/sign-in/email-otp`, `GET /auth/get-session` and `POST /auth/sign-out` to `auth.handler`. Every other `/auth/*` path is a `not_found` problem. Later issues (TON-22 OAuth, M8) add their endpoints to the list.
- **Alternative:** Better Auth's `disabledPaths`. It is a denylist, so each upgrade or plugin could expose new endpoints, for example `/update-user`, which would let a client set the display name around `/v1`.

**2. Email keys and the two emails.**

- `packages/domain/src/accounts.ts` exports `emailKey()` (TS-70): trim, lowercase, and the domain converted to ASCII with `new URL()` (IDNA). Plus-addresses stay as they are. A `hooks.before` middleware applies it to `body.email` on both sign-in endpoints, and the creator seed stores it. So `user.email` always holds the key, and Better Auth's lowercase lookups match.
- The plugin calls `sendVerificationOTP` only for existing accounts. It sends the **sign-in code** template: the code, and the link `${WEB_ORIGIN}/sign-in/verify?email=<key>#code=<code>`. The code is in the fragment, so it never reaches a server log or a `Referer`.
- A `hooks.after` middleware on the code request looks the address up. When there is no account, it sends the **no account** template in the background, so both paths do one lookup and one background send.
- `packages/domain/src/email.ts` defines `EmailPort.send(template, to, data)` and pure `renderEmail()` functions for plain English text (TS-72). `apps/api/src/email/smtp.ts` implements the port with nodemailer and `SMTP_URL`. Tests use a capturing port.
- **Alternative:** turning `disableSignUp` off and sorting the emails inside `sendVerificationOTP`. Better Auth would then create an account when the code is submitted, which breaks FR-11.2.

**3. One cookie for both hosts, derived from the web origin.**

- TS-08 puts the web app at the apex and the API at `api.<apex>`, so the cookie domain is the `WEB_ORIGIN` hostname.
- For `localhost` or an IP address, no `Domain` attribute is set. A host-only `localhost` cookie already reaches both ports, because cookies ignore ports, and `localhost:3000` and `localhost:3001` are same-site.
- `useSecureCookies` is always on, so the name and attributes match production. Chromium and Firefox accept `Secure` cookies on `http://localhost`.
- **Alternative:** a separate `SESSION_COOKIE_DOMAIN` setting. That is one more value that could disagree with TS-08.

**4. A small in-memory sign-in limiter instead of Better Auth's.**

- `apps/api/src/auth/sign-in-limits.ts` keeps sliding-window counters in memory (TS-104: a single instance):
  - email key: 5 code requests per 15 min;
  - IP address: 20 requests across both endpoints per 15 min.
- The `/auth/*` route checks it before Better Auth runs: it reads a clone of the body for the email. A refusal is a `429` `rate_limited` problem with `Retry-After`, and nothing is stored or sent.
- The client IP is the socket address (`server.requestIP`), or, when `CLIENT_IP_HEADER` is set, that header from the host's proxy (for `X-Forwarded-For`, its last entry, which is the address the proxy saw). Which header to use is set when the host is configured (TON-12).
- **Alternative:** Better Auth's limiter. It can't key by email. Without a trusted IP header it falls back to one bucket shared by everyone, which would make 20 sign-ins per 15 minutes a global limit. It also resets only after a quiet window.

**5. `signedIn` guard and `/v1/me`.**

- `apps/api/src/auth/plugin.ts` adds an Elysia macro, `signedIn: true`. It calls `auth.api.getSession({ headers, returnHeaders: true })` and forwards any renewed `Set-Cookie`. It resolves `principal: { kind: "user", userId, role, client: "web" }` (TS-30) and `account`. Without a session, it answers a `401` `unauthenticated` problem.
- `apps/api/src/routes/v1/me.ts` returns `accountSchema` from `packages/domain`: `{ id, email, displayName: string | null, role }`, with `401: problemSchema`. Eden and OpenAPI then type both responses.
- `unauthenticated` joins the TS-27 codes. Clients already tolerate new codes (TS-09).

**6. Tables and foreign keys.**

- `packages/db/src/schema/auth.ts` adds four tables, using the project's helpers (`table`, `instant`, `timestamps`):
  - `user`: `id` uuid, `email` unique (the email key), `email_verified`, `display_name` nullable, `image`, `role` with a CHECK for `creator`/`user`, and a partial unique index on `role` where it is `creator`, so there is at most one creator;
  - `session`: a unique `token`, `user_id` with `ON DELETE CASCADE`;
  - `account`: Better Auth's columns, `user_id` with `ON DELETE CASCADE`;
  - `verification`: `identifier` indexed.
- Foreign keys to `user.id` are added from `trash_units.owner_id`, `containers.owner_id`, `albums.owner_id`, `album_service_links.owner_id`, `memberships.owner_id`, `field_definitions.owner_id`, `share_grants.grantee_id`, `saved_references.viewer_id`, `view_prefs.person_id`, `positions.person_id`, `account_sync.account_id`, `change_log.account_id` and `mutations.account_id`.
- These use the default `NO ACTION`: TS-74 deletes owned data in chunks and removes the user row last, so the database refuses the reverse order instead of cascading one huge delete.
- One migration, `auth_tables`. The schema tests insert real users now.

**7. Configuration.**

- `apps/api/src/config.ts` reads `PORT`, `API_ORIGIN`, `WEB_ORIGIN`, `BETTER_AUTH_SECRET`, `SMTP_URL`, `EMAIL_FROM` and `CLIENT_IP_HEADER`, like `packages/db/src/config.ts` does:
  - local defaults: `http://localhost:3001`, `http://localhost:3000`, a fixed development secret, `smtp://localhost:1025` and `Tonaris <no-reply@tonaris.test>`;
  - in production, the origins, secret, SMTP URL and sender are required, and a missing one stops start-up.
- A root `.env.example` lists every variable (TS-105).
- The web app reads the API origin at build time from `VITE_API_URL`, defaulting to `http://localhost:3001`. TON-12 may move it to runtime configuration.

**8. Web: plain `fetch` for auth, Eden for `/v1`.**

- `apps/web/src/features/account/auth-client.ts` makes the three auth calls (request code, sign in, sign out) with `credentials: "include"`. It maps their outcomes to the page's messages: wrong, expired or used code; too many attempts; rate limited, with minutes from `Retry-After`; unreachable.
- **Alternative:** `better-auth/client`. It would add a client bundle and a second version to keep in step, for three calls.
- The browser's Eden client sends credentials. `session.ts` caches the `/v1/me` result for the page's lifetime, never caches a failure, and is cleared on sign-out.
- `_workspace` `beforeLoad` (client-only) loads it. A `401` redirects to `/sign-in?redirect=<path>`, and the account reaches the shell through the route context.
- `safeRedirect()` accepts only paths that start with a single `/`. Anything else becomes `/c`.

**9. Web: the DS-90 screens.**

- `routes/sign-in.tsx` becomes a layout with the wordmark and card. `sign-in.index.tsx` holds the email step and `sign-in.verify.tsx` the code step. Both stay server-rendered (TS-03).
- **Same-browser check:** asking for a code stores `{ email, redirect, at }` in `localStorage`.
  - When a link opens `/sign-in/verify` with `#code=…`, the page removes the fragment from history. If the stored request matches the email, it submits the code at once.
  - Otherwise it asks "Sign in on this device?", so a different browser, or a mail scanner that runs scripts, never spends the code unasked.
  - **Alternative:** a server-side device binding (a cookie set when the code is requested). It is stronger, but Better Auth's endpoints don't support one, and the code itself is the credential.
- **The code input:** one `<input>` with `inputmode="numeric"`, `autocomplete="one-time-code"` and `maxlength` 6. A paste keeps only the digits. Six digits submit automatically, and a submit button remains for keyboard and assistive-technology users.
- **Resend:** the button is disabled for 30 s after each send and shows the remaining seconds. "Use a different email" returns to `/sign-in` and keeps `redirect`.
- **Account menu:** a Base UI menu (shadcn Dropdown Menu) at the top of the sidebar (DS-31, item 1). The trigger shows the display name or the email, and the only item for now is **Sign out**. The wordmark row stays above it.

**10. Tests.**

- **API** (`bun test`, a fresh schema each):
  - the full code flow, case-insensitive email, a wrong code, single use, expiry (the stored `expires_at` moved into the past), 5 attempts;
  - the unknown address: same response, the no-account email, no account created;
  - the cookie attributes, with and without a parent domain;
  - session renewal (`session.updated_at` moved back), `/v1/me` with and without a session, sign-out;
  - the endpoint allowlist, CORS for the web origin and for others;
  - both limits;
  - the creator seed: create, repeat, a second creator refused, an existing user refused, missing or invalid `CREATOR_EMAIL`.
- **Browser** (`bun run test:e2e`): Playwright starts a second web server, `apps/api/src/e2e-server.ts`.
  - It migrates a fresh `tonaris_test` schema, seeds the creator and one account per sign-in test, and serves the API on port 3101, with `WEB_ORIGIN` set to the preview origin, mail going to Mailpit, and the per-IP limit raised, since every test shares 127.0.0.1. It drops the schema when it stops.
  - A setup project signs the creator in through the API and saves the storage state, which the shell tests use.
  - The sign-in tests start signed out, each with its own account, and read codes and links from Mailpit by recipient. They cover the code flow and its destination, the link in the same browser and in a second context, a used link, the unknown address, sign-out, the resend cooldown and a wrong code, plus axe on both sign-in pages.

## Risks / Trade-offs

- **[Safari does not accept `Secure` cookies on `http://localhost`]** → Local development and the e2e suite use Chromium and Firefox, and production is HTTPS. WebKit e2e runs (TS-121) will need HTTPS locally or a development-only exception; this is recorded in the README.
- **[The e2e suite now needs Postgres and Mailpit]** → Both are part of the local setup (TS-06). CI provisioning is TON-11's open decision, and this change adds a note there.
- **[The "no account" email lets anyone trigger mail to any address]** → The per-email and per-IP limits bound it. The text is neutral, and it carries no link that could start anything.
- **[In-memory limits reset on restart and don't span instances]** → Acceptable for the single instance TS-104 assumes. The limiter's interface allows a Postgres store later.
- **[The `localStorage` same-browser check is a heuristic]** → It only decides whether to ask first. The code stays the credential, with 5 attempts and a 10-minute lifetime.
- **[Better Auth's error bodies on `/auth/*` are `{ message, code }`, not problems]** → TS-04 places `/auth/*` outside the `/v1` contract. Our own refusals (404, 429) there are problems, and the web client handles both shapes.
- **[Direct SMTP in the request process]** → Sending runs in the background and its errors are logged. TON-73 moves it to the job queue with retries.

## Migration Plan

- Run `bun run db:migrate` to add the auth tables and the foreign keys. The existing tables are empty everywhere (no deploy has happened), so the foreign keys apply cleanly.
- Then run `bun run seed:creator` with `CREATOR_EMAIL` set.
- Locally, sign in at `/sign-in` with the code from Mailpit.
- Rollback is reverting the PR together with its migration, before any real accounts exist.
