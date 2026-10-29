# Design

## Context

- **`users.email`** holds the email key (TS-70) and is unique. Sessions are rows in `sessions`, with no cookie cache, so a session reads the account's current email on every request.
- **Better Auth's email-OTP change** (`/email-otp/request-email-change`, `/email-otp/change-email`) doesn't fit TS-73:
  - it lowercases instead of using the email key;
  - its current-address code is an `email-verification` code, which the sign-in hook refuses to send;
  - it neither ends other sessions nor writes an audit log in the swap's transaction.
- **TON-73 added the templates:** `email-change-current {code, newEmail}` and `email-change-new {code}`, each dropped after 10 minutes if unsent.
- **The sign-in limiter** (TS-104) limits code requests per address and IP, and code submissions per IP.

## Goals / Non-Goals

**Goals:** the change's storage and routes, the Account page with its stepper, `audit_log`, and AC-39's self-service checks.

**Non-Goals:**
- creator-assisted recovery (TON-78), which reuses the swap with the creator as the actor;
- the danger zone (TON-79);
- the "Lost access to your email?" link (TON-78).

## Decisions

### 1. Own storage, one change per account

`email_changes`:
- **Columns:** `user_id` (primary key, cascading), `new_email_key`, `stage` (`current` or `new`), `code_hash` (SHA-256), `attempts`, `expires_at`, and timestamps.
- **One per account:** starting again replaces the change in progress, so an earlier code stops working.
- **Cancelling** deletes it.

**Alternative considered:** Better Auth's verification rows. Their identifiers and attempt format are its internals, and the swap needs its own transaction anyway.

### 2. Codes

- **Shape:** six random digits (rejection sampling over `crypto.getRandomValues`). Only the SHA-256 is stored, and it is compared in constant time.
- **Limits:** 10 minutes and 5 attempts, from `signInCode`. A wrong code counts in its own statement, so the count survives.
- **Sending:** starting and resending ask the limiter's `codeRequest` for the address the code goes to. Verifying asks `codeSubmission`.

### 3. Verifying is one locked step

`submitEmailChangeCode` locks the change's row for update, then:
1. **No change:** none.
2. **Past its expiry:** expired.
3. **Out of attempts:** locked.
4. **A wrong code:** counts an attempt; wrong.
5. **At `current`:** the row moves to `new`, with the next code's hash, made before the call, and a fresh expiry and attempt count. The route emails that code after the commit.
6. **At `new`, in the same transaction:**
   - lock the user;
   - if another user has the new key, delete the change and answer taken;
   - otherwise change `users.email` (verified), delete the account's other sessions, insert `audit_log` (`email.change`, actor and subject the account, details `{from, to}`), and delete the change.

   A unique violation from a racing account also answers taken.

Two simultaneous right codes can't both swap: the second waits on the lock and then finds no change.

### 4. Routes

All routes are under `/v1/account/email-change`, need a session, and are authorized as an `account` write, so MCP never reaches them (X-03).

| Route | Answers |
| --- | --- |
| `GET` | `{ change: { newEmail, stage } \| null }` |
| `POST {newEmail}` | `{ newEmail, stage: "current" }`, with the code sent to the current address |
| `POST …/verify {code}` | `{ stage: "new", newEmail }`, with the code sent to the new address; or `{ stage: "done", email }` |
| `POST …/resend {}` | `{ newEmail, stage }`, with a new code for the current step |
| `DELETE` | 204 |

**Refusals** are problems with a sentence in `detail`:
- a non-address, the current address, another account's address, a wrong code, or out of attempts: 422 `validation_failed`;
- an expired code: 410 `expired`;
- no change in progress: 404 `not_found`;
- the limiter: 429.

The code sentences are sign-in's (DS-90).

### 5. `audit_log`

The table has `id`, `actor` and `subject` (UUIDs with no foreign key, so the record outlives a deleted account), `action` (checked against `auditActions`, `email.change` for now), `details jsonb`, and `at`.

### 6. The page

- **Route:** `/settings/account`, second in the subnav.
- **Steps:** the "Sign-in email" section shows the address and **Change sign-in email**.
  - step 1 has a "New email address" field and **Continue**;
  - step 2 has "Check {current}" and the shared code field;
  - step 3 has "Check {new}";
  - a "Step n of 3" line tells them apart.
- **On every step:** **Resend code** after 30 s, and **Cancel**.
- **Done** shows "Done — use {new} to sign in". The account is reloaded, so the menu shows the new address.
- **Resuming:** the loader reads `GET`, so a reload resumes at the step in progress.

## Risks / Trade-offs

- **[Account existence]:** refusing another account's address tells a member that the address has an account. Sharing already does the same (`recipient_not_found`, X-05), and the limiter caps attempts.
- **[A late code email]:** a code mailed just before the person cancels may still arrive, but no change matches it any more.

## Migration Plan

One migration adds `email_changes` and `audit_log`. Nothing else changes.
