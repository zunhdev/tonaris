# Tasks

## 1. Storage

- [x] 1.1 Add `email_changes`, `audit_log` and `auditActions`, generate the migration, and add the storage functions: start, find, renew, submit (design decisions 1, 3 and 5), and cancel. Verify with database tests:
  - starting replaces a change;
  - a wrong code counts, and the fifth locks;
  - an expired code is refused;
  - the current step moves on;
  - the new step swaps, ends only other sessions, and writes the audit log;
  - a taken key refuses and changes nothing;
  - two right codes at once swap once.

## 2. API

- [x] 2.1 Add the routes (design decisions 2 and 4) and their schemas in `packages/domain`. Regenerate OpenAPI. Verify with API tests for AC-39's self-service part:
  - codes go to the current address, then the new one, with their templates;
  - refusals for a non-address, the current address and a taken one;
  - wrong, expired and used-up codes;
  - cancel changes nothing;
  - after the swap, the old address signs in to nothing, the new one reaches the same account, and another session is signed out;
  - a bearer token gets 401.

## 3. Web

- [x] 3.1 Add `/settings/account` with the stepper, and Account in the subnav (design decision 6). Verify with Playwright in `settings-account.e2e.ts`:
  - the full change through Mailpit's codes ends in "Done — use {new} to sign in", and the menu shows the new address;
  - another browser's session is signed out;
  - the new address signs in;
  - cancelling at step 2 changes nothing;
  - another account's address is refused;
  - axe finds no violations.

## 4. Docs

- [x] 4.1 Record DS-93 and TS-73 as built, and TS-11's two tables. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI comparison with main (only additions).

## Workflow follow-up

- Archive the change as the PR's last commit.
