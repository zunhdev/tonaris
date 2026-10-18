# Proposal

Linear: TON-9 (Feature). Implements FR-11.1 (passwordless sign-in and sign-out) and the sign-in side of FR-11.2 (email verification alone never admits), through DS-90 and DS-31's account menu, TS-08, TS-70, TS-71 (creator bootstrap) and the sign-in limits of TS-104.

## Why

Nothing in Tonaris knows who is using it yet: the API has no principals, `/sign-in` is a placeholder, and the workspace opens for anyone. Every later issue needs a signed-in person. M1's MCP OAuth and admission spikes (TON-22, TON-24) build on Better Auth, settings (TON-76) and the email provider (TON-73) extend it, and M2 commands need a principal and real `user` rows for their owner foreign keys. M0's exit check also asks for a signed-in cross-origin call.

## What Changes

- Add Better Auth (1.7.10) to the API with the email OTP plugin, served at `api.<domain>/auth/*`. Only the endpoints sign-in needs are exposed: request a code, sign in with it, read the session and sign out.
- Codes are 6 digits, valid for 10 minutes, single-use, with 5 attempts (TS-70), and stored hashed. The email carries the code and a link to `/sign-in/verify` that submits the same code.
- The session cookie `__Secure-tonaris.session_token` is `Secure`, `HttpOnly` and `SameSite=Lax`. In production it is scoped to the parent domain, so both the web and API hosts see it (TS-08). Sessions roll over 30 days.
- Sign-in never creates an account (FR-11.2). An unknown address gets the same screen, and its email explains that there is no account instead of carrying a code.
- Sign-in limits, approved by the creator on 18 October 2026 (TS-104): code requests are limited to 5 per email address per 15 minutes, and code requests plus submissions to 20 per IP address per 15 minutes.
- Add `GET /v1/me` for the signed-in account. Add an Elysia `signedIn` guard that resolves the TS-30 principal. Add the `unauthenticated` (401) error code to TS-27; the addition is additive.
- Add Better Auth's tables (`user` with `role` and `display_name`, `session`, `account`, `verification`) and the foreign keys from every owner, account, person, grantee and viewer column to `user.id`, as planned in TON-5.
- Add a one-time creator bootstrap, `bun run seed:creator`, which reads `CREATOR_EMAIL` and creates the single `creator` account (TS-71). It is idempotent, so the pre-deploy step can run it on every deploy.
- Add an `EmailPort` in `packages/domain`, with plain English templates for the sign-in code and "no account" emails, and an SMTP adapter in the API. Locally, the adapter sends to Mailpit (TS-06, TS-72).
- Allow credentialed CORS for the web origin only, which the cross-origin sign-in calls need (TS-102). TON-10 keeps the CSRF content-type rule, the bearer-ignores-cookies rule, the CSP and the rejection tests.
- Build the DS-90 web screens:
  - `/sign-in`, with an email field;
  - `/sign-in/verify`, with a 6-digit code input, a resend button with a 30-second cooldown and "Use a different email". Opening the email link signs in automatically in the same browser; on another device, it first asks "Sign in on this device?". An expired or used link is explained.

  Add the sidebar account menu (DS-31) with the account's name or email and **Sign out**.
- Workspace routes require a session: a signed-out visit goes to `/sign-in` and returns to the original destination afterwards.

## Capabilities

### New Capabilities

- `accounts`: signing in and out with an emailed code or link, the session shared by the web and API hosts, the sign-in limits, and the signed-in account's identity (FR-11.1).
- `admission`: who may hold an account. Here that covers sign-in never creating one and the creator's bootstrap; invitations and pausing come with TON-24 and M8 (FR-11.2, TS-71).

### Modified Capabilities

- `app-shell`: workspace routes now require a signed-in session, and the shell scenarios are for a signed-in person.

## Impact

- **Code:**
  - `packages/domain`: email keys, the account schema, the email port and its templates, and the `unauthenticated` code.
  - `packages/db`: the auth tables, the owner foreign keys and a migration.
  - `apps/api`: config, Better Auth, the `/auth/*` mount, the sign-in limiter, CORS, the `signedIn` guard, `/v1/me`, the SMTP adapter and the creator seed.
  - `apps/web`: the sign-in routes, the session check on the workspace, the account menu, and a credentialed API client.
- **Dependencies:**
  - `better-auth` 1.7.10, `@elysia/cors` 2.0.0-beta.2 and `nodemailer` 10.1.6 (with `@types/nodemailer`) in the API;
  - shadcn's Input, Label and Dropdown Menu components on Base UI in `packages/ui`.

  All are pinned exactly (TS-07).
- **API contract:**
  - `/v1/me` is added to `openapi/v1.json`;
  - `unauthenticated` is added to the error codes;
  - `/auth/*` sits outside `/v1`, as TS-04 requires.
- **Environment:** `BETTER_AUTH_SECRET`, `WEB_ORIGIN`, `API_ORIGIN`, `SMTP_URL`, `EMAIL_FROM`, `CREATOR_EMAIL` and an optional `CLIENT_IP_HEADER` are listed in a new `.env.example`. Production requires the secrets and origins; development has local defaults.
- **Tests:**
  - API integration tests run against the local Postgres.
  - The browser tests now also start the API on a fresh test schema and read codes from Mailpit, so `bun run test:e2e` needs Postgres and Mailpit running.
- **Docs:** TS-11 (auth tables, foreign keys), TS-27 (`unauthenticated`), TS-70 (cookie name, link form, same-browser check), TS-71 (seed command), TS-104 (approved sign-in limits, limiter), TS-105 (`.env.example`), DS-31 and DS-90 if wording is settled, and the README.
- **Later issues:**
  - TON-10 adds CSRF and the CSP.
  - TON-12 runs `seed:creator` in the pre-deploy step and sets `CLIENT_IP_HEADER` for the host's proxy.
  - TON-73 replaces SMTP-to-Mailpit with the chosen provider and moves sending to the job queue.
  - TON-76 lets people edit their display name.
