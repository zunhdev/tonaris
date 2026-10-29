# Tasks

## 1. Storage

- [x] 1.1 Extract `swapSignInEmail` from the email change, and add `email_recoveries`, `email.recover`, the migration, and the recovery's storage: issue, list members, cancel, confirm (design decisions 1 and 2). Verify with database tests:
  - the email change still passes;
  - a recovery swaps, ending all sessions, and disconnects connections only when asked;
  - it writes the audit log with the reason;
  - a taken key refuses;
  - wrong, expired and used-up codes are refused;
  - a new request replaces the old one;
  - cancelling removes it.

## 2. API

- [x] 2.1 Add `SUPPORT_EMAIL`, `GET /v1/support`, the admin's member and recovery routes, and `POST /auth/recovery/confirm` (design decisions 3–5). Regenerate OpenAPI. Verify with API tests for AC-39's recovery part:
  - creator-only routes;
  - the member list has only email, name and join date;
  - the recovery email goes to the new address with its link;
  - confirming swaps, ends sessions and records the reason;
  - the old address signs in to nothing;
  - refusals at the start (non-address, current, taken, blank reason) and at confirmation (taken meanwhile, wrong code, expired, cancelled);
  - connections are disconnected only when asked;
  - the config requires `SUPPORT_EMAIL` in production.

## 3. Web

- [x] 3.1 Add `/help/recovery`, the two links, the Admin tabs, `/admin/members` with its dialog, and `/recover/$token` with no Referer (design decision 6). Verify with Playwright in `email-recovery.e2e.ts`:
  - from sign-in, the help page shows the support address;
  - the creator recovers a member, the row waits, the new address's link confirms, and the member signs in with it;
  - the old address signs in to nothing;
  - cancelling a recovery makes its link refuse;
  - axe passes on the help page, the members page and the confirmation;
  - a non-creator gets not found.

## 4. Docs

- [x] 4.1 Record DS-93, DS-100 and TS-73 as built, add `SUPPORT_EMAIL` to TS-105, `.env.example` and the deploy guide, and add `email_recoveries` to TS-11. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI comparison with main (only additions).

## Workflow follow-up

- Archive the change as the PR's last commit.
