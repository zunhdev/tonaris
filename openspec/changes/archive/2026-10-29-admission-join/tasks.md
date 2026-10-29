# Tasks

## 1. API

- [x] 1.1 Add `POST /auth/admission/invitation` (design decision 1). Verify with API tests:
  - a usable invitation answers its address and sends nothing;
  - invalid, revoked, expired, used and paused invitations answer their sentences;
  - a share invitation to an address with no account creates no account (AC-01).

## 2. Web

- [x] 2.1 Extract `CodeField` and `useResendCountdown` from the sign-in verify page (design decision 4), and add the auth-client calls and the `refused` reason (design decision 5). Verify with the existing sign-in e2e tests, and auth-client unit tests for `refused`.
- [x] 2.2 Add the `/join/$token` route with its steps (design decisions 2 and 3), `no-referrer` for `/join/`, and the root's "Connect an AI assistant" (design decision 6). Verify with Playwright, in the admission e2e file run in order:
  - the creator invites an address; its email's link shows "You're invited to Tonaris" with the address;
  - Continue and the emailed code join;
  - the name step saves "Anna";
  - the first-run state shows both actions;
  - signing out and in again reaches the same account, named Anna;
  - the code link in another browser asks "Join on this device?";
  - a wrong code shows DS-90's message;
  - a revoked invitation's link shows only its sentence;
  - axe finds no violations on the landing and the code step;
  - a header test checks `no-referrer` on `/join/…`.

## 3. Docs

- [x] 3.1 Record DS-91 and DS-105 as built, and add the lookup to TS-71. Verify the text matches the implementation.

## 4. Checks

- [x] 4.1 Run `bun run check`, a native `bun run build`, and the OpenAPI comparison with main (unchanged: the auth routes are hidden).

## Workflow follow-up

- Archive the change as the PR's last commit.
