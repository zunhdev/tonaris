# Proposal

Linear: TON-77 (Feature). Implements FR-11.4. Design: DS-93. Tech: TS-73. Done when AC-39's self-service part passes.

## Why

A member's sign-in email can't change. Someone who switches providers, or who joined with an old address, is stuck with it. FR-11.4 lets a person who still has their current address move the account to a new one, after proving they hold both.

## What Changes

- **Settings → Account** (`/settings/account`, DS-93), the second settings page. It shows the sign-in email and **Change sign-in email**, a three-step stepper:
  1. enter the new address;
  2. enter the code sent to the **current** address;
  3. enter the code sent to the **new** address.

  Then "Done — use {new} to sign in". **Cancel** at any step changes nothing. A change in progress resumes at its step after a reload.
- **`/v1/account/email-change`:** start, verify a code, resend a code, see the change in progress, and cancel. The routes are app-only and need the session.
  - **Refusals:** a non-address, the current address, and an address that belongs to another account.
  - **Codes:** six digits, valid for 10 minutes, with 5 attempts each, as sign-in's.
- **The swap is one transaction** (TS-73), after the new address's code:
  - it changes the email, refusing if another account has the new key;
  - it ends every other session of the account, and keeps this one;
  - it writes `audit_log`.

  The old address then signs in to nothing, and no account is merged or taken over.
- **`audit_log`** (TS-11) arrives with this first use. TON-78 and TON-79 add their actions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: changing the sign-in email (FR-11.4).

## Impact

- **`packages/db`:** the `email_changes` and `audit_log` tables (a migration), and the change's storage, including the swap transaction.
- **`packages/domain`:** the routes' schemas and sentences.
- **`apps/api`:** the routes (additive in OpenAPI) and the two templates TON-73 made.
- **`apps/web`:** the Account page and the subnav.
- **Docs:** DS-93 and TS-73 recorded as built, and TS-11's tables.
