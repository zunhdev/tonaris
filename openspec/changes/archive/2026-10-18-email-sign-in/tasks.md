# Tasks

## 1. Dependencies

- [x] 1.1 Add the pinned API dependencies: `better-auth` 1.7.10, `@elysia/cors` 2.0.0-beta.2, `nodemailer` 10.1.6 and `@types/nodemailer` 8.0.2 (dev). Add shadcn's Input, Label and Dropdown Menu to `packages/ui` with `bun run ui:add`, restyled to DS-15 sizes and semantic tokens. Verify that `bun install --frozen-lockfile`, `bun run check:workspace`, `bun run typecheck` and the token tests pass.

## 2. Domain: email keys, account schema, email port, outcome code

- [x] 2.1 Add `packages/domain/src/accounts.ts`: `emailKey()` (trim, lowercase, IDNA domain), `userRoles`, and `accountSchema` (`id`, `email`, `displayName` or null, `role`). Verify with unit tests: case and whitespace, an IDN domain, plus-addresses kept, and input without an `@` left lowercased.
- [x] 2.2 Add `packages/domain/src/email.ts`: the `EmailPort` type and `renderEmail()` for the `sign-in-code` (code and link) and `sign-in-no-account` templates, in plain English text. Verify with unit tests that the code email contains the code and the link, and that the no-account email contains neither a code nor a link.
- [x] 2.3 Add `unauthenticated` to the TS-27 error codes in `outcomes.ts` and in TS-27, and export the new modules. Verify that the outcome tests and `bun run typecheck` pass.

## 3. Database: auth tables and foreign keys

- [x] 3.1 Add `packages/db/src/schema/auth.ts` (design.md decision 6): `user` with the role CHECK and the single-creator index, `session`, `account` and `verification`. Add the foreign keys from every owner, account, person, grantee and viewer column to `user.id`, and update the TON-9 comments in the schema files. Generate the `auth_tables` migration and read the SQL. Verify that `bun run db:check` passes and that `bun run db:migrate` applies to the local `tonaris` database.
- [x] 3.2 Update `schema.test.ts`: list the new tables, insert real users where rows need an owner, and add tests that a row with an unknown owner is refused, that a second creator is refused, and that a user row with owned data can't be deleted while sessions cascade. Verify with `bun test packages/db`.

## 4. API: config, email, Better Auth, limits, CORS, guard

- [x] 4.1 Add `apps/api/src/config.ts` (decision 7) with unit tests: the local defaults, the production requirements, and the cookie domain derived from `WEB_ORIGIN`, with none for `localhost` or IP addresses. Add the root `.env.example`. Verify with `bun test apps/api/src/config.test.ts`.
- [x] 4.2 Add the SMTP `EmailPort` (`apps/api/src/email/smtp.ts`) and a capturing port for tests. Verify by sending one message through it to Mailpit by hand (`bun run mail:test` keeps working).
- [x] 4.3 Add `apps/api/src/auth/auth.ts` (decisions 1–3): the Better Auth instance with the email-key `before` hook, the no-account `after` hook and the code-and-link email. Add `apps/api/src/auth/sign-in-limits.ts` (decision 4) with unit tests for the sliding windows and `Retry-After`.
- [x] 4.4 Add `apps/api/src/auth/plugin.ts`: the allowlisted `/auth/*` route, with the limiter in front, and the `signedIn` macro that resolves the principal and forwards a renewed cookie. Add the CORS allowlist for `WEB_ORIGIN`. Add `GET /v1/me` in `src/routes/v1/me.ts`. Wire it all into `createApp`, `index.ts` and `generate-openapi.ts`. Run `bun run openapi:generate` and review the diff. Verify that `bun run openapi:check` passes.
- [x] 4.5 Write the API integration tests (`apps/api/src/auth/auth.test.ts`, decision 10) for every `accounts` and `admission` sign-in scenario, and update `app.test.ts` for the new app options and paths. Verify with `bun test apps/api`.

## 5. Creator bootstrap

- [x] 5.1 Add `apps/api/src/auth/seed-creator.ts` with `bun run seed:creator` (root and `apps/api` scripts), following the `admission` spec: create, repeat, a second creator refused, an existing account refused, missing or invalid `CREATOR_EMAIL`. Verify with its integration tests, and by hand: `CREATOR_EMAIL=… bun run seed:creator` twice against the local database.

## 6. Web: client, session, sign-in screens, account menu

- [x] 6.1 Add `src/config.ts` (`VITE_API_URL`), the credentialed browser Eden client, `features/account/auth-client.ts`, `session.ts`, `pending-sign-in.ts` and `redirect.ts`. Verify with `bun test apps/web`: `safeRedirect` cases, error mapping from Better Auth and problem bodies, and the Eden client sending credentials.
- [x] 6.2 Build `/sign-in` and `/sign-in/verify` (decision 9): the `sign-in.tsx` layout plus the index and verify routes, the code input, the resend cooldown, "Use a different email", the link handling with the same-browser check, "Sign in on this device?", and the expired-link state. Verify by eye in `bun dev` with a code from Mailpit.
- [x] 6.3 Require a session in `_workspace` (redirect with `redirect=<path>`), pass the account to the shell, and add the sidebar account menu with **Sign out**. Verify by eye: signing in, out, and in again in `bun dev`.

## 7. Browser tests

- [x] 7.1 Add `apps/api/src/e2e-server.ts` and the second Playwright web server, a setup project that saves the creator's storage state, and the Mailpit helpers. Move the shell tests onto the signed-in state. Verify that `bun run test:e2e` runs the existing suite green.
- [x] 7.2 Write `apps/web/e2e/sign-in.e2e.ts` for the browser scenarios: the signed-out redirect and its return destination, the code flow, the link in the same browser and on another device, a used link, an unknown address, a wrong code, the resend cooldown, sign-out, the session reaching the API, the rejection of unsafe destinations, and axe on both pages. Verify that `bun run test:e2e` passes.

## 8. Docs and integration

- [x] 8.1 Update the tech spec:
  - TS-11: the auth tables, the `account` table and the foreign-key policy;
  - TS-70: the cookie name, the link form with the code in the fragment, the same-browser check, hashed codes;
  - TS-71: `bun run seed:creator`;
  - TS-104: the approved sign-in limits and the Tonaris limiter;
  - TS-105: `.env.example`.

  Update the design spec where the wording was settled (DS-31, DS-90). Update the README: running locally, signing in, environment variables, and the e2e requirements (Postgres, Mailpit, and Safari's localhost cookie gap). Verify that `bun run check:specs` passes.
- [x] 8.2 Run `bun run check`. Verify that it passes. Then sign in by hand in `bun dev` as the seeded creator with a code from Mailpit, check that `/v1/me` answers in the browser, and sign out.

## Workflow follow-up

- Archive with `/opsx:archive` as the PR's last commit, before handing the PR over (TS-132). It creates `openspec/specs/accounts` and `openspec/specs/admission`, and updates `app-shell`.
- Add notes to:
  - TON-10: CORS is in place; CSRF and the CSP remain.
  - TON-11: the e2e suite needs Postgres and Mailpit.
  - TON-12: `seed:creator` in the pre-deploy step, `CLIENT_IP_HEADER`, `VITE_API_URL`.
  - TON-73: the `EmailPort`, the templates, and moving sending to the job queue.
  - TON-24: the email-key hook and the `user` table.
