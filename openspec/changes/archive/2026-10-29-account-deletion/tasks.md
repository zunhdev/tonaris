# Tasks

## 1. Storage

- [x] 1.1 Add `user.deleting_at`, `account_deletions` and `account.delete`, generate the migration, and add `beginAccountDeletion`, `deleteAccountData`, the deletion's status functions and the prune (design decisions 1, 2 and 5). Verify with database tests:
  - confirming frees the address, ends sessions and OAuth, revokes links and grants, withdraws the account's own grants, and audits;
  - the creator is refused;
  - the data delete removes every owned row and the user, leaving another account's rows;
  - it is idempotent;
  - members leave out accounts being deleted.

## 2. API

- [x] 2.1 Add the routes, the job and the prune schedule (design decision 3). Regenerate OpenAPI. Verify with API tests for AC-40:
  - a mismatched email and the creator are refused;
  - confirming signs out, the guest link and the invited viewer get nothing, and the AI connection is gone;
  - progress reaches `deleted`, and no owned row remains;
  - another member is unchanged;
  - signing in with the address gets the no-account email;
  - a failed job reports `failed`, and retry finishes it;
  - a bearer token gets 401.

## 3. Web

- [x] 3.1 Add the Danger zone, the dialog and `/account-deleted` (design decision 4). Verify with Playwright in `account-deletion.e2e.ts`:
  - the dialog lists the consequences, and the button waits for the typed email;
  - Cancel changes nothing;
  - deleting ends on "Your account has been deleted";
  - the account's guest link is unavailable;
  - signing in again reaches no account;
  - axe finds no violations;
  - the creator sees no Delete account.

## 4. Docs

- [x] 4.1 Record DS-97 and TS-74 as built, and TS-11's tables and columns. Note the deferred ledger in TS-113. Verify the text matches the implementation.

## 5. Checks

- [x] 5.1 Run `bun run check`, a native `bun run build`, and the OpenAPI comparison with main (only additions).

## Workflow follow-up

- Archive the change as the PR's last commit.
