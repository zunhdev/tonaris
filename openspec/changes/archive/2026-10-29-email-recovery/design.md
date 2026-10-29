# Design

## Context

- **TON-77** built the self-service change. Its swap (`submitEmailChangeCode`, the `new` stage) locks the user, refuses a taken key, changes the email, ends the other sessions, and writes `audit_log`.
- **TON-73** made the `recovery-verification {code, link}` template. Its text says "Enter it on the confirmation page, or open this link".
- **Admin → Admissions** (TON-74) is the creator-only page under `_workspace`, with its routes behind `authorizeAdmissionAdmin`.
- **MCP connections** are Better Auth consents, plus their access and refresh tokens (`revokeConnection`).
- **The API's settings** come from `apiConfig` (TS-105). The web app reads only `API_URL`.

## Goals / Non-Goals

**Goals:** the help page, the member list, recovery from start to confirmation, the shared swap, and AC-39's recovery checks.

**Non-Goals:**
- an in-app request form (TS-73 says there is none);
- signing the person in on confirmation: they sign in with the new address afterwards, as anyone does;
- the email delivery status of recovery emails. The row shows waiting until confirmed.

## Decisions

### 1. One shared swap

`swapSignInEmail(tx, { userId, newEmailKey, keepSessionId })` locks the user and refuses a key another account holds. It then changes the email (verified) and deletes the account's sessions, except `keepSessionId` when given. It answers the old key, or `taken`.

- **The email change** keeps its own session and writes `email.change`.
- **Recovery** keeps none, disconnects AI connections when asked, and writes `email.recover` with `{from, to, reason, disconnectedConnections}` and the creator as actor.

`isUniqueViolation` moves beside the swap.

### 2. `email_recoveries`

- **Columns:**
  - `user_id` (primary key, cascading) and `new_email_key`;
  - `token_hash` (unique) and `code_hash`, both SHA-256;
  - `attempts` and `expires_at`;
  - `reason`, `disconnect_connections`, and `requested_by`;
  - timestamps.
- **One per account:** a new request replaces the earlier one, and its link stops working. Cancelling deletes it.
- **A deleted account** cascades its recovery away, so a deleted account is never recovered.
- **Lifetime: 24 hours.** The person reads the email whenever the creator's message reaches them, so sign-in's 10 minutes would be too short. Attempts are capped at 5, as for codes.

### 3. Confirming

`POST /auth/recovery/confirm {token, code}`:
- **Access:** it is public, beside `/auth/admission/*`, and limited by `codeSubmission` per IP.
- **The check:** the row is found by the token's hash and locked for update.
  - an unknown token is 404, "This recovery link isn't valid. Ask the creator for a new one.";
  - past its expiry is 410, "This recovery link has expired. Ask the creator for a new one.";
  - out of attempts, and a wrong code, are 422 with DS-90's sentences.
- **A right code** runs the swap in the same transaction. A taken key deletes the recovery and answers 422 "That address belongs to another Tonaris account."
- **Success** answers `{ email }`.

The link is `/recover/:token#code=…`, so the code stays out of server logs, as join links do. The page asks for a click before confirming, so a mail scanner that fetches the link changes nothing.

### 4. The admin's routes

Behind `authorizeAdmissionAdmin`:

| Route | Does |
| --- | --- |
| `GET /v1/admin/members` | `{ members: [{ id, email, displayName, joinedAt, recovery: { newEmail, requestedAt } \| null }] }`, oldest member first |
| `POST /v1/admin/members/:id/recovery {newEmail, reason, disconnectConnections}` | issues the recovery and emails it; 200 with the member |
| `DELETE /v1/admin/members/:id/recovery` | 204 |

- **The member list** selects from `user` only, plus the recovery row, so no collection table is read.
- **Refusals** are 422 with a sentence:
  - a non-address;
  - the member's current address;
  - another account's address;
  - a blank reason (the reason is at most 500 characters).

  An unknown member is 404.

### 5. The support address

- **The setting:** `SUPPORT_EMAIL` in `ApiConfig`, required in production like `EMAIL_FROM`, and `support@tonaris.test` locally.
- **The route:** `GET /v1/support` answers `{ email }`, public, so the help page reads it in its loader on the server and in the browser alike.
- **The page:** `/help/recovery` is server-rendered and public, in the sign-in card's frame.

### 6. The pages

- **Admin tabs:** `AdminNav` (Admissions · Members) sits under each admin page's header, as `SettingsNav` does.
- **`/admin/members`:**
  - a table of Email, Display name, Joined, and Recovery;
  - **Recover sign-in email** opens a dialog with "New email address", "Reason" (a text area) and "Also disconnect AI connections";
  - a waiting row shows "Waiting for verification · {new}" and **Cancel recovery**.
- **`/recover/$token`:**
  - client-rendered, and its URL sends no Referer;
  - "Confirm your new sign-in email", with the code field filled from the link and **Confirm**;
  - then "Done — use {email} to sign in." with a link to sign-in, or the refusal's sentence.
- **Links:** "Lost access to your email?" on the sign-in email step and on Settings → Account.

## Risks / Trade-offs

- **[Ownership is the creator's judgment]:** Tonaris can't check it (TS-73). The audit log records who recovered what, and why.
- **[A forwarded recovery email]:** whoever holds the link and code can confirm. The email goes only to the new address that the person gave the creator, as with admission.

## Migration Plan

One migration adds `email_recoveries` and widens `audit_log`'s action check to `email.recover`. Production also needs `SUPPORT_EMAIL` set before deploying, which the deploy guide adds.
