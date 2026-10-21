# Tonaris — Invite-only admission in one transaction with Better Auth, 21 October 2026

Spike for [TON-24](https://linear.app/zunhdev/issue/TON-24). [TS-71](../tech-spec.md) says account creation must do all of this atomically:

- check that admissions aren't paused;
- check for an available invitation bound to the email;
- create the user;
- redeem the invitation.

The open question was whether that can share a transaction with Better Auth's session creation. `databaseHooks.user.create.before` alone may not share one.

## Verdict

**Go. Admission and Better Auth's sign-in run in one Postgres transaction.**

Better Auth 1.7.12 can open a real transaction (`runWithTransaction`) once its Drizzle adapter has `transaction: true`. Its own queries then run on that transaction, and Tonaris's admission queries join it. Better Auth consumes the code and creates the session in the same transaction. The whole join either commits or rolls back.

The tests show that concurrent or repeated registrations never use an invitation without creating its account, and never create two accounts:

| Scenario | Result |
| --- | --- |
| 8 simultaneous joins with one code | 1 account, 1 session, and the invitation redeemed once. The other 7 are refused: 403 "already used" if they waited on the invitation's lock, 400 `INVALID_OTP` if they came after the commit. Same result in 10 reruns. |
| Writing the session fails (a test trigger on `session`) | 500. No account, the invitation still available, and the code unused (0 attempts). Once sessions can be written again, the same code works. |
| A pause commits while a join waits on it | The join is refused as paused, and nothing changes. After resuming, the same code works. |
| A revocation commits while a join waits on it | Refused as revoked; no account. |
| A retry after a lost response | The same code is refused (already used), and the link answers "already used… sign in". Signing in reaches the one account. |
| 5 wrong codes | Each counts, though no transaction commits. The right code is then refused (`TOO_MANY_ATTEMPTS`). |
| A forwarded link | The code goes only to the invited address. A code for another invitation is refused. |
| Signing in with an invited address | Still the "no account" email; nothing is created (FR-11.2). |
| An invitation to an address that already has an account | Joining signs its owner in; the invitation stays available. |
| Three invitations joining at once | All three succeed. |

## What was built

| Layer | Where | What |
| --- | --- | --- |
| Domain | `packages/domain/src/admission.ts` | Statuses, the 14-day expiry, derived expiry (`invitationStatus`), a sentence for each refusal (DS-91), and the request schemas. A `join-code` email template in `email.ts`. |
| Tables | `packages/db/src/schema/admission.ts`, migration `20261021184946_admission` | `admission_invitations` and the `service_state` row, as TS-11 lists them (see the notes below). |
| Storage | `packages/db/src/admission.ts` | `admitAccount`, which takes the locks, runs the checks, inserts the user and redeems the invitation on the caller's transaction. Also find, insert, revoke and pause, for tests now and for TON-74 later. |
| Transaction | `apps/api/src/auth/transaction.ts` | `inAuthTransaction`, which runs Tonaris's queries on Better Auth's transaction |
| Endpoints | `apps/api/src/auth/admission.ts` | `POST /auth/admission/code` and `POST /auth/admission/join`, plus `issueAdmissionInvitation` |

Tests:
- 13 API integration tests in `apps/api/src/auth/admission.test.ts`;
- 3 schema tests in `packages/db/src/schema.test.ts`.

The web page `/join/:token` (DS-91) and the creator's admin (DS-100) aren't built; they belong to M8.

## How it works

1. **`POST /auth/admission/code {token}`**
   - The token from the invitation link finds the invitation.
   - An unknown link, or a revoked, used or expired invitation, is refused with its sentence, and so are paused admissions.
   - Otherwise, Better Auth stores a sign-in code for the invited address (`createVerificationOTP`), and Tonaris emails it with a link to `/join/{token}#code=…`.
   - The response is `{ email }`, the invited address.
2. **`POST /auth/admission/join {token, otp}`**
   1. **Check the code, outside any transaction.** `checkVerificationOTP` counts a wrong guess and doesn't consume a right code. Its answer tells three cases apart:
      - a right code and no account (`USER_NOT_FOUND`): go on;
      - a right code for an existing account: sign in normally;
      - a wrong, expired or used-up code: Better Auth's error is returned as it is, just as sign-in returns it.
   2. **Admit, in one transaction** (`inAuthTransaction`):
      1. Lock the `service_state` row `FOR SHARE`. If admissions are paused, refuse.
      2. Lock the invitation `FOR UPDATE`. If it isn't available, or has expired, refuse.
      3. Check that no account has the address. If one does, roll back and sign its owner in.
      4. Insert the user, with the email verified and no display name (FR-11.3), and mark the invitation redeemed.
      5. Call `auth.api.signInEmailOTP`. Better Auth consumes the code and creates the session, on the same transaction.
      6. Commit. The response carries Better Auth's session cookie.

      Any failure rolls back every step.

### Joining Better Auth's transaction

- **Real transactions.** With `transaction: true` on the Drizzle adapter, `runWithTransaction` (from `@better-auth/core/context`, now a direct dependency at 1.7.12) opens a real transaction.
- **Better Auth's queries follow it.** Better Auth's internal adapter looks up the current adapter in an AsyncLocalStorage on every query, so all its writes inside the callback go to the transaction. That holds when Tonaris calls `auth.api.*`, too: only `auth.handler` starts a fresh context.
- **Tonaris's queries join it.** The adapter opens its transaction with `db.transaction` on the database it was given. Tonaris gives it a proxy (`recordingTransactions`) that records each transaction it opens, and `inAuthTransaction` hands that transaction to Tonaris's queries.
- **A loud failure.** If an upgrade stopped opening transactions this way, `inAuthTransaction` throws rather than run admission outside the transaction, and the tests fail.
- **Before, each Better Auth write committed on its own** (`transaction: false`). Now Better Auth's multi-step writes, such as consuming a code, run in real transactions too. The 79 existing sign-in, OAuth and MCP tests pass unchanged.

### Why the code is checked before the transaction

Better Auth records a wrong guess by rewriting the code's row. Inside a transaction that then rolls back, the attempt would be erased, and the 5-attempt limit (TS-70) would never bite.

So the attempt-counting check commits on its own. The consumption inside the transaction stays the single-use gate: of two joins with the same code, only one can consume it.

### Why not Better Auth's sign-up or database hooks

- **No transaction.** Email OTP sign-up (`disableSignUp: false`) creates the user and then the session as separate writes, outside any transaction.
- **The hooks can't redeem.** `user.create.after` hooks are queued until after the commit, so a redemption there would sit outside the transaction. `user.create.before` doesn't know the new user's ID, so it can't record the redeemer before the insert without a deferrable foreign key.
- **A weaker guarantee.** Turning sign-up on would make "sign-in never creates an account" depend on a hook instead of Better Auth's own switch.

TS-71's custom endpoint stays.

## Findings and decisions

1. **The endpoints sit under `/auth/admission/*`, beside Better Auth's sign-in, and answer like it.**
   - **Success:** the session cookie.
   - **A wrong or expired code:** Better Auth's error code (`INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`), which the web's sign-in client already handles.
   - **Refusals:** problems with TS-27 codes, carrying the DS-91 sentence in `detail`:
     - unknown link: 404 `not_found`;
     - expired: 410 `expired`;
     - revoked, used or paused: 403 `permission_denied`.
   - **Limits (TS-104):** code requests count per address and per IP, and joins per IP.
   - **Hidden from OpenAPI,** like the rest of `/auth/*`.
2. **A pause waits for admissions in flight.** Admission locks the service row for share, so pausing (an `UPDATE`) waits for joins that already passed the check. A join that starts after the pause commits sees it. Pausing redeems and revokes nothing (FR-11.6), so a code sent before a pause works after resuming.
3. **A lost response is reconciled through sign-in (FR-13.5).** Retrying the same code fails, because it was used. The link then says the invitation was used and suggests signing in, and sign-in reaches the account. No duplicate is created and nothing is lost. A join can't sign a retry in by itself, because the code is gone.
4. **Joining with an address that already has an account signs its owner in** (FR-11.2: existing users sign in normally). The invitation stays available. TON-74 should refuse to issue invitations to existing accounts.
5. **The tables follow TS-11, with four additions:**
   - `redeemed_at`, with a check that it is set exactly when the status is `redeemed`;
   - `token_hash` is `bytea` (SHA-256), like `share_links`;
   - `redeemed_by` is set to null when its account is deleted, so the redemption stays on record (TS-74);
   - the migration inserts the single `service_state` row by hand, since drizzle-kit generates no data.
6. **Expiry is checked on use.** An available invitation past `expires_at` counts as expired before the daily job records it (TS-110).
   - Its row still counts against the partial unique index on `email_key`, so a new invitation for the same address fails until then.
   - Re-issuing (TS-71) must therefore renew that row, with a new token and expiry, or mark it expired first. TON-74 decides which.
7. **Better Auth's `checkVerificationOTP` answers `USER_NOT_FOUND` only after the code is verified.** The join relies on that to tell "right code, no account" apart from a wrong code. It's covered by the tests, so an upgrade that changes it will fail them.

## Open (M8)

- **The invitation page** `/join/:token` (DS-91): the bound address before **Continue**, the verify step, the optional display name, and a status lookup for the link.
- **The creator's admin** (TON-74, DS-100):
  - issue, re-issue and revoke invitations;
  - pause and resume admissions;
  - email delivery status (`email_status`);
  - the daily expiry job;
  - the audit log.

## Running it again

```
bun run db:migrate
bun test apps/api/src/auth/admission.test.ts packages/db/src/schema.test.ts
```

The tests need the local Postgres. Email stays in memory.
